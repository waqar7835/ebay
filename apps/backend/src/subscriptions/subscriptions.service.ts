import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { Role, SEAT_LIMITED_ROLES, SubscriptionPaymentStatus, UserStatus } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { SubscriptionPlan } from "../database/models/subscription-plan.model";
import { SubscriptionBillingPeriod } from "../database/models/subscription-billing-period.model";
import { SubscriptionPayment } from "../database/models/subscription-payment.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { MailerService } from "../mailer/mailer.service";
import { addDays, addMonths, daysBetween, todayDateOnly } from "./subscription-date.util";
import type { BillingPeriodDto, CreatePlanDto, UpdateBillingPeriodDto, UpdatePlanDto } from "./dto/subscription.dto";

const ROLE_LABEL: Record<string, string> = {
  [Role.ACCOUNT_HOLDER]: "Account Holder",
  [Role.STOCK_OWNER]: "Stock Owner",
  [Role.THREE_PL]: "3PL",
  [Role.STAFF]: "Staff",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function planLimit(plan: SubscriptionPlan, role: Role): number {
  switch (role) {
    case Role.ACCOUNT_HOLDER:
      return plan.maxAccountHolders;
    case Role.STOCK_OWNER:
      return plan.maxStockOwners;
    case Role.THREE_PL:
      return plan.maxThreePls;
    case Role.STAFF:
      return plan.maxStaff;
    default:
      return Infinity;
  }
}

/**
 * Company subscriptions. A company is always on exactly one plan: its paid plan while
 * `subscriptionEndsAt` hasn't passed, otherwise the single free plan. The plan caps how many
 * non-disabled (ACTIVE or INVITED) accounts the company may have per seat-limited role; the
 * company Admin never counts. When a paid plan expires every account except the Admin is
 * disabled (flagged `disabledBySubscription`) and the Admin re-enables up to the free plan's
 * limits; approving a renewal restores flagged accounts as far as the new plan allows.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(SubscriptionPlan) private readonly planModel: typeof SubscriptionPlan,
    @InjectModel(SubscriptionBillingPeriod) private readonly periodModel: typeof SubscriptionBillingPeriod,
    @InjectModel(SubscriptionPayment) private readonly paymentModel: typeof SubscriptionPayment,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(UserRoleAssignment) private readonly userRoleModel: typeof UserRoleAssignment,
    private readonly mailer: MailerService,
  ) {}

  // --- Plans ---

  listPlans(includeInactive: boolean) {
    return this.planModel.findAll({
      where: includeInactive ? {} : { isActive: true },
      order: [
        ["sortOrder", "ASC"],
        ["pricePerMonth", "ASC"],
      ],
    });
  }

  async getFreePlan(): Promise<SubscriptionPlan> {
    const plan = await this.planModel.findOne({ where: { isFree: true } });
    if (!plan) throw new NotFoundException("No free plan is configured");
    return plan;
  }

  createPlan(dto: CreatePlanDto) {
    return this.planModel.create({ ...dto, isFree: false });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findByPk(id);
    if (!plan) throw new NotFoundException("Plan not found");
    if (plan.isFree && dto.isActive === false) {
      throw new BadRequestException("The free plan can't be deactivated — it's what companies fall back to");
    }
    if (plan.isFree && dto.pricePerMonth !== undefined && dto.pricePerMonth !== 0) {
      throw new BadRequestException("The free plan's price must stay 0");
    }
    // Lowering limits never disables anyone; companies over the new limit just can't add more accounts.
    Object.assign(plan, dto);
    await plan.save();
    return plan;
  }

  /** Plans that were ever used are kept for the record — deactivate them instead. */
  async deletePlan(id: string) {
    const plan = await this.planModel.findByPk(id);
    if (!plan) throw new NotFoundException("Plan not found");
    if (plan.isFree) throw new BadRequestException("The free plan can't be deleted");
    const used =
      (await this.companyModel.count({ where: { subscriptionPlanId: id } })) +
      (await this.paymentModel.count({ where: { planId: id } }));
    if (used > 0) {
      throw new ConflictException("This plan has been subscribed to — deactivate it instead of deleting it");
    }
    await plan.destroy();
    return { deleted: true };
  }

  // --- Billing periods ---

  listPeriods(includeInactive: boolean) {
    return this.periodModel.findAll({ where: includeInactive ? {} : { isActive: true }, order: [["months", "ASC"]] });
  }

  async createPeriod(dto: BillingPeriodDto) {
    await this.assertPeriodMonthsFree(dto.months);
    return this.periodModel.create({ ...dto });
  }

  async updatePeriod(id: string, dto: UpdateBillingPeriodDto) {
    const period = await this.periodModel.findByPk(id);
    if (!period) throw new NotFoundException("Billing period not found");
    if (dto.months !== undefined && dto.months !== period.months) await this.assertPeriodMonthsFree(dto.months);
    Object.assign(period, dto);
    await period.save();
    return period;
  }

  /** Payments snapshot months + discount, so a period can always be deleted. */
  async deletePeriod(id: string) {
    const period = await this.periodModel.findByPk(id);
    if (!period) throw new NotFoundException("Billing period not found");
    await period.destroy();
    return { deleted: true };
  }

  private async assertPeriodMonthsFree(months: number) {
    if (await this.periodModel.count({ where: { months } })) {
      throw new ConflictException(`A ${months}-month billing period already exists`);
    }
  }

  // --- A company's subscription ---

  /** The plan whose limits apply right now: the paid plan until its end date has passed, else the free plan. */
  async effectivePlan(company: Company): Promise<SubscriptionPlan> {
    if (company.subscriptionPlanId && company.subscriptionEndsAt && company.subscriptionEndsAt >= todayDateOnly()) {
      const plan = await this.planModel.findByPk(company.subscriptionPlanId);
      if (plan) return plan;
    }
    return this.getFreePlan();
  }

  async getCompanySubscription(companyId: string) {
    const company = await this.findCompany(companyId);
    const plan = await this.effectivePlan(company);
    const endsAt = plan.isFree ? null : company.subscriptionEndsAt;
    const counts = await this.seatCounts(companyId);
    const pendingPayment = await this.paymentModel.findOne({
      where: { companyId, status: SubscriptionPaymentStatus.SUBMITTED },
      order: [["createdAt", "DESC"]],
    });
    return {
      plan,
      endsAt,
      daysLeft: endsAt ? daysBetween(todayDateOnly(), endsAt) : null,
      usage: SEAT_LIMITED_ROLES.map((role) => ({ role, used: counts.get(role) ?? 0, limit: planLimit(plan, role) })),
      pendingPayment,
    };
  }

  /** Non-disabled accounts per seat-limited role (a multi-role account counts toward each of its roles). */
  private async seatCounts(companyId: string, excludeUserId?: string): Promise<Map<Role, number>> {
    const rows = await this.userRoleModel.findAll({
      where: { role: SEAT_LIMITED_ROLES },
      include: [
        {
          model: this.userModel,
          attributes: [],
          where: {
            companyId,
            status: { [Op.ne]: UserStatus.DISABLED },
            ...(excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {}),
          },
        },
      ],
    });
    const counts = new Map<Role, number>();
    for (const row of rows) counts.set(row.role, (counts.get(row.role) ?? 0) + 1);
    return counts;
  }

  /**
   * Throws unless the company's current plan has room for one more account holding `roles`.
   * `excludeUserId` is the account being (re-)enabled, so it isn't counted against itself.
   */
  async assertSeatsAvailable(companyId: string, roles: Role[], excludeUserId?: string) {
    const limited = roles.filter((r) => SEAT_LIMITED_ROLES.includes(r));
    if (!limited.length) return;
    const company = await this.findCompany(companyId);
    const plan = await this.effectivePlan(company);
    const counts = await this.seatCounts(companyId, excludeUserId);
    for (const role of limited) {
      const limit = planLimit(plan, role);
      if ((counts.get(role) ?? 0) >= limit) {
        throw new ForbiddenException(
          `Your ${plan.name} plan allows ${limit} ${ROLE_LABEL[role]} account${limit === 1 ? "" : "s"} and they're all in use. ` +
            `Upgrade your subscription or disable another ${ROLE_LABEL[role]} first.`,
        );
      }
    }
  }

  async isUserDisabled(userId: string): Promise<boolean> {
    const user = await this.userModel.findByPk(userId, { attributes: ["id", "status"] });
    return user?.status === UserStatus.DISABLED;
  }

  // --- Payments ---

  async quote(planId: string, billingPeriodId: string) {
    const plan = await this.planModel.findByPk(planId);
    if (!plan || !plan.isActive || plan.isFree) throw new BadRequestException("Choose an available paid plan");
    const period = await this.periodModel.findByPk(billingPeriodId);
    if (!period || !period.isActive) throw new BadRequestException("Choose an available billing period");
    const subtotal = round2(plan.pricePerMonth * period.months);
    const amount = round2(subtotal * (1 - period.discountPercent / 100));
    return { plan, period, subtotal, amount };
  }

  async submitPayment(params: {
    companyId: string;
    submittedByUserId: string | null;
    planId: string;
    billingPeriodId: string;
    receiptFileUrl: string | null;
    referenceNote: string | null;
  }) {
    if (!params.receiptFileUrl) throw new BadRequestException("Upload the payment receipt");
    const pending = await this.paymentModel.count({
      where: { companyId: params.companyId, status: SubscriptionPaymentStatus.SUBMITTED },
    });
    if (pending) throw new ConflictException("A payment is already waiting for review");

    const { plan, period, amount } = await this.quote(params.planId, params.billingPeriodId);
    return this.paymentModel.create({
      companyId: params.companyId,
      planId: plan.id,
      planName: plan.name,
      months: period.months,
      pricePerMonth: plan.pricePerMonth,
      discountPercent: period.discountPercent,
      amount,
      status: SubscriptionPaymentStatus.SUBMITTED,
      receiptFileUrl: params.receiptFileUrl,
      referenceNote: params.referenceNote,
      submittedByUserId: params.submittedByUserId,
    });
  }

  listCompanyPayments(companyId: string) {
    return this.paymentModel.findAll({ where: { companyId }, order: [["createdAt", "DESC"]] });
  }

  async listPayments(status?: SubscriptionPaymentStatus) {
    const payments = await this.paymentModel.findAll({
      where: status ? { status } : {},
      include: [{ model: this.companyModel, attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
    });
    return payments.map((p) => ({ ...p.toJSON(), companyName: p.company?.name ?? null, company: undefined }));
  }

  async reviewPayment(id: string, reviewerBackofficeUserId: string, approve: boolean) {
    const payment = await this.paymentModel.findByPk(id);
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== SubscriptionPaymentStatus.SUBMITTED) {
      throw new ConflictException("This payment has already been reviewed");
    }
    const company = await this.findCompany(payment.companyId);

    payment.reviewedByBackofficeUserId = reviewerBackofficeUserId;
    payment.reviewedAt = new Date();

    if (!approve) {
      payment.status = SubscriptionPaymentStatus.REJECTED;
      await payment.save();
      await this.emailAdmin(
        company,
        "Your subscription payment was not approved",
        `<p>Your payment for the ${payment.planName} plan (${payment.months} month${payment.months === 1 ? "" : "s"}) was not approved. Please check the receipt and submit it again.</p>`,
      );
      return payment;
    }

    // Renewing the same plan before it runs out extends it; anything else starts today.
    const today = todayDateOnly();
    const extends_ =
      company.subscriptionPlanId === payment.planId && !!company.subscriptionEndsAt && company.subscriptionEndsAt >= today;
    const periodStart = extends_ ? addDays(company.subscriptionEndsAt!, 1) : today;
    const periodEnd = addDays(addMonths(periodStart, payment.months), -1);

    payment.status = SubscriptionPaymentStatus.APPROVED;
    payment.periodStart = periodStart;
    payment.periodEnd = periodEnd;
    await payment.save();

    await this.applyPlan(company, payment.planId, periodEnd);
    await this.emailAdmin(
      company,
      "Your subscription is active",
      `<p>Your payment was approved. You're on the ${payment.planName} plan until ${periodEnd}.</p>`,
    );
    return payment;
  }

  /** Super Admin override: put a company on a plan until `endsAt` (the free plan needs no date). */
  async assignPlan(companyId: string, planId: string, endsAt?: string) {
    const company = await this.findCompany(companyId);
    const plan = await this.planModel.findByPk(planId);
    if (!plan) throw new NotFoundException("Plan not found");
    if (plan.isFree) {
      await this.expire(company, false);
      return this.getCompanySubscription(companyId);
    }
    if (!endsAt || endsAt < todayDateOnly()) throw new BadRequestException("Pick an end date from today onwards");
    await this.applyPlan(company, plan.id, endsAt);
    return this.getCompanySubscription(companyId);
  }

  private async applyPlan(company: Company, planId: string, endsAt: string) {
    company.subscriptionPlanId = planId;
    company.subscriptionEndsAt = endsAt;
    company.subscriptionRemindersSent = 0;
    await company.save();
    await this.restoreSubscriptionDisabledUsers(company.id);
  }

  /** Re-enables accounts switched off by an expiry, oldest first, as far as the current plan allows. */
  private async restoreSubscriptionDisabledUsers(companyId: string) {
    const users = await this.userModel.findAll({
      where: { companyId, disabledBySubscription: true, status: UserStatus.DISABLED },
      include: [UserRoleAssignment],
      order: [["createdAt", "ASC"]],
    });
    for (const user of users) {
      try {
        await this.assertSeatsAvailable(
          companyId,
          user.roleAssignments.map((r) => r.role),
          user.id,
        );
      } catch {
        continue;
      }
      user.status = user.inviteAcceptedAt ? UserStatus.ACTIVE : UserStatus.INVITED;
      user.disabledBySubscription = false;
      await user.save();
    }
  }

  // --- Expiry (driven by SubscriptionsScheduler) ---

  /** Sends the 5-day and 1-day expiry reminders and expires lapsed plans. */
  async sweep() {
    const today = todayDateOnly();
    const companies = await this.companyModel.findAll({
      where: { subscriptionPlanId: { [Op.ne]: null }, subscriptionEndsAt: { [Op.ne]: null } },
    });
    for (const company of companies) {
      const endsAt = company.subscriptionEndsAt!;
      if (endsAt < today) {
        await this.expire(company, true);
        continue;
      }
      const daysLeft = daysBetween(today, endsAt);
      const due = daysLeft <= 1 ? 2 : daysLeft <= 5 ? 1 : 0;
      if (due > company.subscriptionRemindersSent) {
        company.subscriptionRemindersSent = due;
        await company.save();
        const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
        await this.emailAdmin(
          company,
          `Your subscription expires ${when}`,
          `<p>Your subscription ends on ${endsAt}. Renew it before then — once it expires, every account except yours ` +
            `is deactivated and you can only re-enable as many as the free plan allows.</p>`,
        );
      }
    }
  }

  /** Drops the company to the free plan; `disableUsers` switches off every account except the Admin. */
  private async expire(company: Company, disableUsers: boolean) {
    company.subscriptionPlanId = null;
    company.subscriptionEndsAt = null;
    company.subscriptionRemindersSent = 0;
    await company.save();
    if (!disableUsers) return;

    const adminIds = (
      await this.userRoleModel.findAll({
        where: { role: Role.ADMIN },
        include: [{ model: this.userModel, attributes: [], where: { companyId: company.id } }],
      })
    ).map((r) => r.userId);
    const [count] = await this.userModel.update(
      { status: UserStatus.DISABLED, disabledBySubscription: true },
      { where: { companyId: company.id, status: { [Op.ne]: UserStatus.DISABLED }, id: { [Op.notIn]: adminIds } } },
    );
    this.logger.log(`Subscription expired for company ${company.id}; ${count} account(s) deactivated`);
    await this.emailAdmin(
      company,
      "Your subscription has expired",
      `<p>Your subscription has expired and your company is back on the free plan. ${count} account(s) were deactivated. ` +
        `You can re-enable accounts up to the free plan's limits from the Users page, or renew your subscription to restore them all.</p>`,
    );
  }

  private async findCompany(companyId: string): Promise<Company> {
    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  private async emailAdmin(company: Company, subject: string, html: string) {
    const admin = await this.userModel.findOne({
      where: { companyId: company.id },
      include: [{ model: UserRoleAssignment, where: { role: Role.ADMIN }, attributes: [] }],
    });
    if (admin) await this.mailer.send(admin.email, subject, html);
  }
}
