import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Role } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { PlatformSetting } from "../database/models/platform-setting.model";
import { SeatBilling } from "../database/models/seat-billing.model";
import { SeatPaymentOrder, SeatPaymentOrderStatus } from "../database/models/seat-payment-order.model";
import { SeatPaymentOrderItem } from "../database/models/seat-payment-order-item.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { MailerService } from "../mailer/mailer.service";
import { daysBetween, nextBillingDate, proratedAmount } from "./billing-date.util";

const PAID_ROLES = [Role.ACCOUNT_HOLDER, Role.STOCK_OWNER, Role.THREE_PL];

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(PlatformSetting) private readonly settingModel: typeof PlatformSetting,
    @InjectModel(SeatBilling) private readonly seatBillingModel: typeof SeatBilling,
    @InjectModel(SeatPaymentOrder) private readonly orderModel: typeof SeatPaymentOrder,
    @InjectModel(SeatPaymentOrderItem) private readonly orderItemModel: typeof SeatPaymentOrderItem,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(UserRoleAssignment) private readonly userRoleModel: typeof UserRoleAssignment,
    private readonly mailer: MailerService,
  ) {}

  async getSeatPrice(): Promise<number> {
    const setting = await this.settingModel.findOne();
    return setting?.seatPricePerMonth ?? 10;
  }

  /** Called whenever a user is granted a paid role for the first time. */
  async ensureSeatBilling(userId: string): Promise<void> {
    const existing = await this.seatBillingModel.findByPk(userId);
    if (!existing) {
      await this.seatBillingModel.create({ userId, paidThroughDate: null, blocked: false });
    }
  }

  /**
   * A brand-new company gets one free month for the first Account Holder, first
   * Stock Owner, and first 3PL it invites (each tracked independently). Consumes
   * the company's flag for `role` if unused and extends the seat's paid-through
   * date by a month; a no-op if that role's free seat was already used.
   */
  async grantFreeSeatIfAvailable(companyId: string, userId: string, role: Role): Promise<void> {
    if (!PAID_ROLES.includes(role)) return;

    const company = await this.companyModel.findByPk(companyId);
    if (!company) return;

    const alreadyUsed =
      role === Role.ACCOUNT_HOLDER
        ? company.freeAccountHolderUsed
        : role === Role.STOCK_OWNER
          ? company.freeStockOwnerUsed
          : company.freeThreePlUsed;

    if (alreadyUsed) return;

    if (role === Role.ACCOUNT_HOLDER) company.freeAccountHolderUsed = true;
    else if (role === Role.STOCK_OWNER) company.freeStockOwnerUsed = true;
    else company.freeThreePlUsed = true;
    await company.save();

    const [billing] = await this.seatBillingModel.findOrCreate({ where: { userId }, defaults: { userId } });
    const from = billing.paidThroughDate ? new Date(billing.paidThroughDate) : new Date();
    const extended = new Date(from);
    extended.setMonth(extended.getMonth() + 1);
    billing.paidThroughDate = extended.toISOString().slice(0, 10);
    billing.blocked = false;
    await billing.save();
  }

  async isSeatBlocked(userId: string): Promise<boolean> {
    const billing = await this.seatBillingModel.findByPk(userId);
    return billing?.blocked ?? false;
  }

  /**
   * Computes the charge for covering `userId` for `months` months. The first-ever
   * charge for a seat is prorated from today through the company's next billing
   * anchor date; subsequent charges are full months from wherever the seat's
   * paid-through date currently sits.
   */
  async previewCharge(companyId: string, userId: string, months: number) {
    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");

    const seatPrice = await this.getSeatPrice();
    const billing = await this.seatBillingModel.findByPk(userId);
    const today = new Date();

    let periodStart: Date;
    let amount = 0;

    if (!billing?.paidThroughDate) {
      // First-ever charge: prorated stub from today to the next billing anchor date.
      periodStart = today;
      const stubEnd = nextBillingDate(company.billingAnchorDay, today);
      amount += proratedAmount(periodStart, stubEnd, seatPrice);

      let periodEnd = stubEnd;
      for (let i = 1; i < months; i++) {
        const nextEnd = new Date(periodEnd);
        nextEnd.setMonth(nextEnd.getMonth() + 1);
        amount += seatPrice;
        periodEnd = nextEnd;
      }

      return { periodStart, periodEnd, months, amount: Math.round(amount * 100) / 100 };
    }

    periodStart = new Date(billing.paidThroughDate);
    let periodEnd = periodStart;
    for (let i = 0; i < months; i++) {
      const nextEnd = new Date(periodEnd);
      nextEnd.setMonth(nextEnd.getMonth() + 1);
      amount += seatPrice;
      periodEnd = nextEnd;
    }

    return { periodStart, periodEnd, months, amount: Math.round(amount * 100) / 100 };
  }

  async submitOrder(params: {
    companyId: string;
    submittedByUserId: string;
    items: { userId: string; months: number }[];
    receiptFileUrl: string | null;
    referenceNote: string | null;
  }) {
    if (params.items.length === 0) {
      throw new BadRequestException("Select at least one seat to pay for");
    }

    const itemRows = [];
    let total = 0;
    for (const item of params.items) {
      const charge = await this.previewCharge(params.companyId, item.userId, item.months);
      total += charge.amount;
      itemRows.push({
        userId: item.userId,
        periodStart: charge.periodStart,
        periodEnd: charge.periodEnd,
        months: item.months,
        amount: charge.amount,
      });
    }

    const order = await this.orderModel.create({
      companyId: params.companyId,
      submittedByUserId: params.submittedByUserId,
      status: SeatPaymentOrderStatus.SUBMITTED,
      totalAmount: Math.round(total * 100) / 100,
      receiptFileUrl: params.receiptFileUrl,
      referenceNote: params.referenceNote,
    });

    await this.orderItemModel.bulkCreate(itemRows.map((row) => ({ ...row, seatPaymentOrderId: order.id })));

    return this.orderModel.findByPk(order.id, { include: [SeatPaymentOrderItem] });
  }

  async listCompanyOrders(companyId: string) {
    return this.orderModel.findAll({
      where: { companyId },
      include: [SeatPaymentOrderItem],
      order: [["createdAt", "DESC"]],
    });
  }

  async listPendingOrders() {
    return this.orderModel.findAll({
      where: { status: SeatPaymentOrderStatus.SUBMITTED },
      include: [SeatPaymentOrderItem],
      order: [["createdAt", "ASC"]],
    });
  }

  async reviewOrder(orderId: string, reviewerId: string, approve: boolean) {
    const order = await this.orderModel.findByPk(orderId, { include: [SeatPaymentOrderItem] });
    if (!order) throw new NotFoundException("Seat payment order not found");
    if (order.status !== SeatPaymentOrderStatus.SUBMITTED) {
      throw new ForbiddenException("This order has already been reviewed");
    }

    order.status = approve ? SeatPaymentOrderStatus.PAID : SeatPaymentOrderStatus.REJECTED;
    order.reviewedByUserId = reviewerId;
    order.reviewedAt = new Date();
    await order.save();

    if (approve) {
      for (const item of order.items) {
        const [billing] = await this.seatBillingModel.findOrCreate({
          where: { userId: item.userId },
          defaults: { userId: item.userId },
        });
        billing.paidThroughDate = item.periodEnd;
        billing.blocked = false;
        billing.remindersSentCount = 0;
        billing.lastReminderSentAt = null;
        await billing.save();

        const user = await this.userModel.findByPk(item.userId);
        if (user) {
          await this.mailer.send(
            user.email,
            "Your seat payment was approved",
            `<p>Your seat payment has been approved. Your access is active through ${item.periodEnd}.</p>`,
          );
        }
      }
    } else {
      // Rejected: fall back to the normal reminder/block clock based on the seat's
      // actual paid-through date (handled by the daily sweep).
      for (const item of order.items) {
        const user = await this.userModel.findByPk(item.userId);
        if (user) {
          await this.mailer.send(
            user.email,
            "Your seat payment was not approved",
            `<p>Your recent seat payment submission was not approved. Please submit a new payment.</p>`,
          );
        }
      }
    }

    return order;
  }

  /** True if a user holds at least one paid role. */
  async userHasPaidRole(userId: string): Promise<boolean> {
    const count = await this.userRoleModel.count({ where: { userId, role: PAID_ROLES } });
    return count > 0;
  }

  static readonly PAID_ROLES = PAID_ROLES;
  static readonly daysBetween = daysBetween;
}
