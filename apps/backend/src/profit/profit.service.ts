import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import {
  Currency,
  ExpenseChargedTo,
  InvoiceLineKind,
  InvoiceStatus,
  OrderStatus,
  ProfitCycleDto,
  ProfitCycleSummaryDto,
  ProfitMiscLineDto,
  ProfitOrderLineDto,
  ProfitOverviewDto,
  ProfitRefundLineDto,
  ProfitShareRowDto,
  ProfitSourceGroupDto,
  ProfitSplitMemberDto,
  ProfitSplitSettingsDto,
  Role,
} from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { Invoice } from "../database/models/invoice.model";
import { InvoiceLineItem } from "../database/models/invoice-line-item.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { Expense } from "../database/models/expense.model";
import { ExpenseCategory } from "../database/models/expense-category.model";
import { ProfitStatement } from "../database/models/profit-statement.model";
import { FinanceService, isDropshipOrder } from "../finance/finance.service";
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import { InvoiceTemplatesService } from "../invoices/templates/invoice-templates.service";
import { cycleContaining, formatLocalDate, parseLocalDate as parseLocal } from "../invoices/billing-cycle.util";
import { addDays } from "../subscriptions/subscription-date.util";
import { isFullRefund, refundCompanyImpact } from "../invoices/refund-settlement.util";
import { renderProfitStatementPdf } from "../invoices/invoice-pdf-templated";
import { readUpload } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ProfitAccess, ProfitAccessService } from "./profit-access.service";
import { ProfitSplitSettingsInputDto } from "./dto/profit.dto";

interface Cycle {
  start: string;
  end: string;
  statement: ProfitStatement | null;
}

/** Everything one request needs about the company's profit cycles, loaded once. */
interface Context {
  company: Company;
  access: ProfitAccess;
  cycles: Cycle[];
  /** Index of the oldest cycle without a statement (it also sweeps up anything an earlier statement missed). */
  firstOpen: number;
  today: string;
  users: Map<string, User>;
  /** The Admin and partners with their current %, loaded once per request. */
  members: { admin: ProfitSplitMemberDto; partners: ProfitSplitMemberDto[] };
  /** Live results per cycle index, so a chain of open cycles is only worked out once. */
  memo: Map<number, Live>;
}

/** A live (not generated) cycle, plus the ids a statement would claim. */
interface Live {
  dto: ProfitCycleDto;
  orderIds: string[];
  refundOrderIds: string[];
  miscLineIds: string[];
  expenseIds: string[];
}

/** Hard stop for walking cycles forward (≈ 50 years of monthly cycles). */
const MAX_CYCLES = 600;
const DRAFT_STATUS = "Draft — not issued";
/** The not-invoiced-yet estimate is approximate anyway; reuse it this long instead of re-reading every open order. */
const ESTIMATE_TTL_MS = 60 * 1000;

/**
 * Company profit split, expenses and profit statements (decided 2026-11-05). See CLAUDE.md "Profit split & expenses".
 *
 * A billing cycle's profit (PKR) = the company profit of every order whose Account Holder invoice was approved in it
 * + the effect of every refund whose Account Holder refund line was approved in it + misc lines of invoices approved in
 * it (AH = money in at the invoice's rate, SO / 3PL = money out). It's split: the Admin and each partner take their %,
 * the company the rest. Net in hand = share − expenses charged to them; the company's also carries the previous
 * cycle's closing balance (the opening balance for the first cycle). A statement freezes a cycle and claims what it
 * counted, so nothing is counted twice.
 */
@Injectable()
export class ProfitService {
  /** Per company: the last estimate and when it was worked out (see ESTIMATE_TTL_MS). */
  private readonly estimateCache = new Map<string, { at: number; value: { orderCount: number; profit: number } }>();

  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(Invoice) private readonly invoiceModel: typeof Invoice,
    @InjectModel(InvoiceLineItem) private readonly lineItemModel: typeof InvoiceLineItem,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(Expense) private readonly expenseModel: typeof Expense,
    @InjectModel(ProfitStatement) private readonly statementModel: typeof ProfitStatement,
    private readonly finance: FinanceService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly templates: InvoiceTemplatesService,
    private readonly accessService: ProfitAccessService,
  ) {}

  // ----- Split settings

  async settings(companyId: string, requester: JwtPayload): Promise<ProfitSplitSettingsDto> {
    await this.accessService.resolve(requester);
    const company = await this.findCompany(companyId);
    const { admin, partners } = await this.members(company);
    return {
      admin,
      partners,
      companyPercent: round2(100 - admin.percent - sum(partners.map((p) => p.percent))),
      openingBalance: company.profitOpeningBalance,
      openingCycleStart: company.profitOpeningCycleStart,
      billingAnchorDay: company.billingAnchorDay,
    };
  }

  async updateSettings(companyId: string, requester: JwtPayload, input: ProfitSplitSettingsInputDto) {
    await this.accessService.assertRealAdmin(requester);
    const company = await this.findCompany(companyId);
    const { partners } = await this.members(company);
    const known = new Set(partners.map((p) => p.userId));
    const unknown = input.partners.find((p) => !known.has(p.userId));
    if (unknown) throw new BadRequestException("One of these people is no longer a partner — reload and try again");

    const percentOf = new Map(input.partners.map((p) => [p.userId, round2(p.percent)]));
    const total = round2(input.adminPercent + sum(partners.map((p) => percentOf.get(p.userId) ?? p.percent)));
    if (total > 100) {
      throw new BadRequestException(`The Admin and partners would get ${total}% — it can't be more than 100%`);
    }

    // Sent back unchanged = kept as stored (re-snapping it would move it after a billing anchor day change).
    const openingStart = !input.openingCycleStart
      ? null
      : input.openingCycleStart === company.profitOpeningCycleStart
        ? company.profitOpeningCycleStart
        : cycleContaining(company.billingAnchorDay, parseLocal(input.openingCycleStart)).periodStart;
    const openingBalance = input.openingBalance === null || input.openingBalance === undefined ? null : round2(input.openingBalance);
    const statements = await this.statementModel.count({ where: { companyId } });
    const balanceChanged = (openingBalance ?? 0) !== (company.profitOpeningBalance ?? 0);
    if (statements > 0 && (openingStart !== company.profitOpeningCycleStart || balanceChanged)) {
      throw new BadRequestException(
        "The opening balance and first cycle can't change once a profit statement exists — delete the statements first",
      );
    }
    if (openingStart && openingStart > formatLocalDate(new Date())) {
      throw new BadRequestException("The first profit cycle can't start in the future");
    }
    if (openingStart && openingStart !== company.profitOpeningCycleStart) {
      // An expense dated before the first cycle would never be counted anywhere.
      const before = await this.expenseModel.findAll({
        where: { companyId, expenseDate: { [Op.lt]: openingStart } },
        attributes: ["title", "expenseDate"],
        order: [["expenseDate", "ASC"]],
      });
      if (before.length) {
        const list = before.slice(0, 5).map((e) => `"${e.title}" (${e.expenseDate})`).join(", ");
        const more = before.length > 5 ? ` and ${before.length - 5} more` : "";
        throw new BadRequestException(
          `The first cycle would start ${openingStart}, after ${before.length} expense${before.length === 1 ? "" : "s"}: ${list}${more}. Pick an earlier first cycle, or change or delete those expenses first`,
        );
      }
    }

    const sequelize = this.companyModel.sequelize!;
    await sequelize.transaction(async (transaction) => {
      company.adminProfitPercent = round2(input.adminPercent);
      company.profitOpeningCycleStart = openingStart;
      company.profitOpeningBalance = openingStart ? (openingBalance ?? 0) : openingBalance;
      await company.save({ transaction });
      for (const [userId, percent] of percentOf) {
        await this.staffProfileModel.update({ partnerPercent: percent }, { where: { userId }, transaction });
      }
    });
    return this.settings(companyId, requester);
  }

  // ----- Cycles

  async overview(companyId: string, requester: JwtPayload): Promise<ProfitOverviewDto> {
    const ctx = await this.context(companyId, requester);
    return {
      cycles: ctx.cycles.map((c) => this.summary(ctx, c)).reverse(),
      canManageStatements: ctx.access.canManageStatements,
      canManageSettings: ctx.access.realAdmin,
      needsSetup: !ctx.company.profitOpeningCycleStart,
    };
  }

  /** One cycle: the frozen statement when generated, otherwise worked out live. */
  async cycle(companyId: string, requester: JwtPayload, cycleStart: string): Promise<ProfitCycleDto> {
    const ctx = await this.context(companyId, requester);
    const index = this.indexOf(ctx, cycleStart);
    return this.cycleDto(ctx, index);
  }

  /** The cycle running today, for the dashboard card. Null until the first profit cycle is set up. */
  async current(companyId: string, requester: JwtPayload): Promise<ProfitCycleDto | null> {
    const ctx = await this.context(companyId, requester);
    if (!ctx.cycles.length) return null;
    return this.cycleDto(ctx, ctx.cycles.length - 1);
  }

  async generate(companyId: string, requester: JwtPayload, cycleStart: string) {
    const ctx = await this.context(companyId, requester);
    const index = this.indexOf(ctx, cycleStart);
    const blocked = this.generateBlockedReason(ctx, index);
    if (blocked) throw new BadRequestException(blocked);
    const cycle = ctx.cycles[index];
    const live = await this.live(ctx, index);
    if (live.dto.generateBlockedReason) throw new BadRequestException(live.dto.generateBlockedReason);
    const template = await this.templates.snapshot(companyId);

    const sequelize = this.statementModel.sequelize!;
    const id = await sequelize.transaction(async (transaction) => {
      const company = await this.companyModel.findByPk(companyId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!company) throw new NotFoundException("Company not found");
      company.lastProfitStatementSequence += 1;
      await company.save({ transaction });
      const now = new Date();
      const statement = await this.statementModel.create(
        {
          companyId,
          statementNumber: formatStatementNumber(company.name, company.lastProfitStatementSequence, now),
          sequence: company.lastProfitStatementSequence,
          cycleStart: cycle.start,
          cycleEnd: cycle.end,
          generatedByUserId: requester.sub,
          generatedAt: now,
          template,
          snapshot: live.dto,
          totalProfit: live.dto.totals.profit,
          companyClosingBalance: live.dto.companyClosingBalance,
        },
        { transaction },
      );

      const changed = () =>
        new ConflictException("Something changed while the statement was being generated — reload and try again");
      const claim = async (ids: string[], run: () => Promise<number>) => {
        if (ids.length && (await run()) !== ids.length) throw changed();
      };
      await claim(live.orderIds, async () => {
        const [n] = await this.orderModel.unscoped().update(
          { profitStatementId: statement.id },
          { where: { id: live.orderIds, profitStatementId: null }, transaction },
        );
        return n;
      });
      await claim(live.refundOrderIds, async () => {
        const [n] = await this.orderModel.unscoped().update(
          { refundProfitStatementId: statement.id },
          { where: { id: live.refundOrderIds, refundProfitStatementId: null }, transaction },
        );
        return n;
      });
      await claim(live.miscLineIds, async () => {
        const [n] = await this.lineItemModel.update(
          { profitStatementId: statement.id },
          { where: { id: live.miscLineIds, profitStatementId: null }, transaction },
        );
        return n;
      });
      await claim(live.expenseIds, async () => {
        const [n] = await this.expenseModel.update(
          { profitStatementId: statement.id },
          { where: { id: live.expenseIds, profitStatementId: null }, transaction },
        );
        return n;
      });
      // An expense added for this cycle after it was worked out would otherwise be left out of every statement.
      const missed = await this.expenseModel.count({
        where: { companyId, profitStatementId: null, expenseDate: { [Op.between]: [cycle.start, cycle.end] } },
        transaction,
      });
      if (missed) throw changed();

      const generatedBy = ctx.users.get(requester.sub);
      statement.snapshot = {
        ...live.dto,
        status: "GENERATED",
        statementId: statement.id,
        statementNumber: statement.statementNumber,
        generatedAt: now.toISOString(),
        generatedByName: generatedBy ? displayName(generatedBy) : null,
        estimate: null,
        canGenerate: false,
        generateBlockedReason: null,
        canDelete: false,
      };
      statement.changed("snapshot", true);
      await statement.save({ transaction });
      return statement.id;
    });
    return this.cycle(companyId, requester, (await this.statementModel.findByPk(id))!.cycleStart);
  }

  /** Only the latest statement can be deleted; its cycle (orders, refunds, misc lines, expenses) opens up again. */
  async remove(companyId: string, requester: JwtPayload, statementId: string) {
    const access = await this.accessService.resolve(requester);
    if (!access.canManageStatements) throw new ForbiddenException("You don't have permission to delete profit statements");
    const statement = await this.statementModel.findOne({ where: { id: statementId, companyId } });
    if (!statement) throw new NotFoundException("Profit statement not found");
    const later = await this.statementModel.count({ where: { companyId, cycleStart: { [Op.gt]: statement.cycleStart } } });
    if (later) throw new BadRequestException("Only the latest profit statement can be deleted — delete the newer ones first");
    // The claims (orders, refunds, invoices, expenses) are cleared by their ON DELETE SET NULL foreign keys.
    await statement.destroy();
    return { id: statementId, deleted: true };
  }

  // ----- PDFs

  /** A generated statement's PDF: the company statement, or one person's (`userId`) when given. */
  async pdf(companyId: string, requester: JwtPayload, statementId: string, userId?: string) {
    await this.accessService.resolve(requester);
    const statement = await this.statementModel.findOne({ where: { id: statementId, companyId } });
    if (!statement) throw new NotFoundException("Profit statement not found");
    const company = await this.findCompany(companyId);
    const template = statement.template ?? (await this.templates.snapshot(companyId));
    const buffer = await this.render(company.name, template, statement.snapshot, {
      number: statement.statementNumber,
      date: statement.generatedAt,
      status: "Finalized",
      userId,
    });
    return { buffer, filename: `${statement.statementNumber}${userId ? `-${personSlug(statement.snapshot, userId)}` : ""}.pdf` };
  }

  /** A live cycle's DRAFT PDF (current or not yet generated). */
  async previewPdf(companyId: string, requester: JwtPayload, cycleStart: string, userId?: string) {
    const ctx = await this.context(companyId, requester);
    const index = this.indexOf(ctx, cycleStart);
    const statement = ctx.cycles[index].statement;
    if (statement) return this.pdf(companyId, requester, statement.id, userId);
    const dto = await this.cycleDto(ctx, index);
    const template = await this.templates.snapshot(companyId);
    const buffer = await this.render(ctx.company.name, template, dto, { number: "DRAFT", date: new Date(), status: DRAFT_STATUS, userId });
    return { buffer, filename: `profit-statement-${cycleStart}-draft${userId ? `-${personSlug(dto, userId)}` : ""}.pdf` };
  }

  private async render(
    companyName: string,
    template: NonNullable<ProfitStatement["template"]>,
    cycle: ProfitCycleDto,
    opts: { number: string; date: Date; status: string; userId?: string },
  ) {
    if (opts.userId && !cycle.shares.some((s) => s.userId === opts.userId)) {
      throw new NotFoundException("That person isn't on this statement");
    }
    return renderProfitStatementPdf({
      companyName,
      cycle,
      number: opts.number,
      date: opts.date,
      status: opts.status,
      personUserId: opts.userId ?? null,
      layout: template.layout,
      colors: template.colors,
      logo: template.logoUrl ? await readUpload(template.logoUrl) : null,
      watermark: template.watermark,
    });
  }

  // ----- Internals

  private async findCompany(companyId: string) {
    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  /** The company Admin and every partner, with their current %. */
  private async members(company: Company): Promise<{ admin: ProfitSplitMemberDto; partners: ProfitSplitMemberDto[] }> {
    const adminUser = await this.userModel.findOne({
      where: { companyId: company.id },
      include: [{ model: UserRoleAssignment, where: { role: Role.ADMIN }, attributes: [] }],
    });
    const partnerProfiles = await this.staffProfileModel.findAll({
      where: { isPartner: true },
      include: [{ model: this.userModel, where: { companyId: company.id } }],
      order: [["createdAt", "ASC"]],
    });
    return {
      admin: {
        userId: adminUser?.id ?? "",
        name: adminUser ? displayName(adminUser) : "Admin",
        kind: "ADMIN",
        percent: company.adminProfitPercent,
      },
      partners: partnerProfiles.map((p) => ({
        userId: p.userId,
        name: displayName(p.user),
        kind: "PARTNER" as const,
        percent: p.partnerPercent ?? 0,
      })),
    };
  }

  private async context(companyId: string, requester: JwtPayload): Promise<Context> {
    const access = await this.accessService.resolve(requester);
    const company = await this.findCompany(companyId);
    const statements = await this.statementModel.findAll({ where: { companyId }, order: [["cycleStart", "ASC"]] });
    const today = formatLocalDate(new Date());

    const cycles: Cycle[] = [];
    const byStart = new Map(statements.map((s) => [s.cycleStart, s]));
    let cursor = company.profitOpeningCycleStart;
    while (cursor && cursor <= today && cycles.length < MAX_CYCLES) {
      const statement = byStart.get(cursor) ?? null;
      const end = statement ? statement.cycleEnd : cycleContaining(company.billingAnchorDay, parseLocal(cursor)).periodEnd;
      cycles.push({ start: cursor, end, statement });
      cursor = addDays(end, 1);
    }
    const firstOpen = cycles.findIndex((c) => !c.statement);

    const users = await this.userModel.findAll({ where: { companyId }, attributes: ["id", "name", "email"] });
    return {
      company,
      access,
      cycles,
      firstOpen: firstOpen === -1 ? cycles.length : firstOpen,
      today,
      users: new Map(users.map((u) => [u.id, u])),
      members: await this.members(company),
      memo: new Map(),
    };
  }

  private indexOf(ctx: Context, cycleStart: string) {
    const index = ctx.cycles.findIndex((c) => c.start === cycleStart);
    if (index === -1) throw new NotFoundException("No profit cycle starts on that date");
    return index;
  }

  private status(ctx: Context, cycle: Cycle): ProfitCycleSummaryDto["status"] {
    if (cycle.statement) return "GENERATED";
    return cycle.end < ctx.today ? "OPEN" : "CURRENT";
  }

  private summary(ctx: Context, cycle: Cycle): ProfitCycleSummaryDto {
    return {
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      status: this.status(ctx, cycle),
      statementId: cycle.statement?.id ?? null,
      statementNumber: cycle.statement?.statementNumber ?? null,
    };
  }

  private generateBlockedReason(ctx: Context, index: number): string | null {
    const cycle = ctx.cycles[index];
    if (cycle.statement) return "This cycle already has a profit statement";
    if (!ctx.access.canManageStatements) return "Only the Admin, or a partner given permission, can generate profit statements";
    if (this.status(ctx, cycle) === "CURRENT") {
      return `This cycle is still running — it can be generated after ${cycle.end}`;
    }
    if (index !== ctx.firstOpen) {
      const first = ctx.cycles[ctx.firstOpen];
      return `Generate the statement for ${first.start} – ${first.end} first (statements go oldest first)`;
    }
    return null;
  }

  private async cycleDto(ctx: Context, index: number): Promise<ProfitCycleDto> {
    const cycle = ctx.cycles[index];
    const latest = index === ctx.firstOpen - 1;
    if (cycle.statement) {
      return {
        ...cycle.statement.snapshot,
        canGenerate: false,
        generateBlockedReason: null,
        canDelete: latest && ctx.access.canManageStatements,
      };
    }
    return (await this.live(ctx, index)).dto;
  }

  /** The previous cycle's company closing balance — or the opening balance for the first cycle. */
  private async broughtForward(ctx: Context, index: number): Promise<number> {
    if (index === 0) return ctx.company.profitOpeningBalance ?? 0;
    const previous = ctx.cycles[index - 1];
    if (previous.statement) return previous.statement.companyClosingBalance;
    return (await this.live(ctx, index - 1)).dto.companyClosingBalance;
  }

  private async live(ctx: Context, index: number): Promise<Live> {
    const cached = ctx.memo.get(index);
    if (cached) return cached;

    const cycle = ctx.cycles[index];
    const companyId = ctx.company.id;
    const nameOf = (id: string | null) => {
      const user = id ? ctx.users.get(id) : undefined;
      return user ? displayName(user) : "—";
    };
    // The oldest open cycle also sweeps up anything approved earlier (from the first cycle on) that no statement
    // counted — e.g. an order added to an invoice after that invoice's cycle was generated.
    const sweepFrom = index === ctx.firstOpen ? ctx.company.profitOpeningCycleStart! : cycle.start;
    const invoices = await this.invoiceModel.findAll({
      where: {
        companyId,
        status: { [Op.ne]: InvoiceStatus.VOID },
        generatedAt: { [Op.gte]: parseLocal(sweepFrom), [Op.lt]: parseLocal(addDays(cycle.end, 1)) },
      },
      attributes: ["id", "invoiceNumber", "role", "currency", "pkrRate", "generatedAt", "userId"],
    });
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const isLate = (invoiceId: string | null) => {
      const invoice = invoiceId ? invoiceById.get(invoiceId) : undefined;
      return !!invoice && formatLocalDate(invoice.generatedAt) < cycle.start;
    };
    const ahInvoiceIds = invoices.filter((i) => i.role === Role.ACCOUNT_HOLDER).map((i) => i.id);

    // Orders: their whole company profit, in the cycle their Account Holder invoice was approved.
    const orders = ahInvoiceIds.length
      ? await this.orderModel.findAll({
          where: { companyId, profitStatementId: null, accountHolderInvoiceId: ahInvoiceIds },
          order: [["orderDate", "ASC"]],
        })
      : [];
    const orderLines: ProfitOrderLineDto[] = [];
    const byAh = new Map<string, ProfitSourceGroupDto>();
    const bySo = new Map<string | null, ProfitSourceGroupDto>();
    const byTpl = new Map<string, ProfitSourceGroupDto>();
    const addTo = <K>(map: Map<K, ProfitSourceGroupDto>, key: K, name: string, order: Order, amount: number) => {
      if (!amount) return;
      const group = map.get(key) ?? { userId: (key as string | null) ?? null, name, amount: 0, orderCount: 0, orders: [] };
      group.amount = round2(group.amount + amount);
      group.orderCount += 1;
      group.orders.push({ orderId: order.id, ebayOrderRef: order.ebayOrderRef, amount });
      map.set(key, group);
    };
    for (const order of orders) {
      const b = this.finance.companyProfitBreakdown(order);
      orderLines.push({
        orderId: order.id,
        ebayOrderRef: order.ebayOrderRef,
        orderDate: order.orderDate,
        invoiceNumber: invoiceById.get(order.accountHolderInvoiceId!)?.invoiceNumber ?? null,
        late: isLate(order.accountHolderInvoiceId),
        accountHolderShare: b.accountHolderShare,
        productMarkup: b.productMarkup,
        stockOwnerCut: b.stockOwnerCut,
        threePlMarkup: b.threePlMarkup,
        total: b.total,
      });
      addTo(byAh, order.accountHolderId, nameOf(order.accountHolderId), order, b.accountHolderShare);
      for (const s of b.sources) {
        addTo(bySo, s.stockOwnerId, s.stockOwnerId ? nameOf(s.stockOwnerId) : "Dropship products", order, round2(s.markup + s.cut));
      }
      if (order.threePlId) addTo(byTpl, order.threePlId, nameOf(order.threePlId), order, b.threePlMarkup);
    }

    // Refunds: the whole effect, in the cycle the Account Holder refund line was approved.
    const refundOrders = ahInvoiceIds.length
      ? await this.orderModel.findAll({
          where: {
            companyId,
            status: OrderStatus.REFUNDED,
            refundProfitStatementId: null,
            accountHolderRefundInvoiceId: ahInvoiceIds,
          },
          order: [["orderDate", "ASC"]],
        })
      : [];
    const refunds: ProfitRefundLineDto[] = refundOrders.map((order) => {
      const impact = refundCompanyImpact(order, this.finance.compute(order).companyRemainderFromOrder);
      return {
        orderId: order.id,
        ebayOrderRef: order.ebayOrderRef,
        note: refundNote(order),
        invoiceNumber: invoiceById.get(order.accountHolderRefundInvoiceId!)?.invoiceNumber ?? null,
        late: isLate(order.accountHolderRefundInvoiceId),
        ...impact,
      };
    });

    // Misc lines (each claimed on its own, so one added to an invoice after a statement counted the others is still
    // counted): AH invoice = money in (converted at the invoice's rate), SO / 3PL invoice = money out.
    const miscRows = invoices.length
      ? await this.lineItemModel.findAll({
          where: { invoiceId: invoices.map((i) => i.id), kind: InvoiceLineKind.MISC, profitStatementId: null },
          order: [
            ["invoiceId", "ASC"],
            ["position", "ASC"],
          ],
        })
      : [];
    const misc: ProfitMiscLineDto[] = [];
    const rates = new Map<string, number | null>();
    const missingRate = new Set<string>();
    for (const line of miscRows) {
      const invoice = invoiceById.get(line.invoiceId)!;
      const incoming = invoice.role === Role.ACCOUNT_HOLDER;
      if (incoming && !rates.has(invoice.id)) rates.set(invoice.id, await this.invoiceRate(invoice));
      const rate = incoming ? rates.get(invoice.id)! : 1;
      if (rate === null) missingRate.add(invoice.invoiceNumber);
      misc.push({
        lineId: line.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        role: invoice.role,
        partyName: nameOf(invoice.userId),
        title: line.description,
        amountOriginal: line.netAmount,
        currency: invoice.currency,
        amount: round2((incoming ? 1 : -1) * line.netAmount * (rate ?? 0)),
        late: formatLocalDate(invoice.generatedAt) < cycle.start,
      });
    }

    const totals = {
      accountHolderShare: round2(sum(orderLines.map((o) => o.accountHolderShare))),
      productMarkup: round2(sum(orderLines.map((o) => o.productMarkup))),
      stockOwnerCut: round2(sum(orderLines.map((o) => o.stockOwnerCut))),
      threePlMarkup: round2(sum(orderLines.map((o) => o.threePlMarkup))),
      orders: round2(sum(orderLines.map((o) => o.total))),
      refunds: round2(sum(refunds.map((r) => r.net))),
      misc: round2(sum(misc.map((m) => m.amount))),
      profit: 0,
      expenses: 0,
    };
    totals.profit = round2(totals.orders + totals.refunds + totals.misc);

    // Expenses dated in the cycle.
    const expenses = await this.expenseModel.findAll({
      where: { companyId, profitStatementId: null, expenseDate: { [Op.between]: [cycle.start, cycle.end] } },
      include: [{ model: ExpenseCategory, attributes: ["name"] }],
      order: [
        ["expenseDate", "ASC"],
        ["createdAt", "ASC"],
      ],
    });
    totals.expenses = round2(sum(expenses.map((e) => e.amount)));

    // The split.
    const { admin, partners } = ctx.members;
    const people = [admin, ...partners].filter((m) => m.userId);
    for (const e of expenses) {
      if (e.chargedTo === ExpenseChargedTo.USER && e.chargedToUserId && !people.some((p) => p.userId === e.chargedToUserId)) {
        // Charged to someone who is no longer a partner: still shown, with no share.
        people.push({ userId: e.chargedToUserId, name: nameOf(e.chargedToUserId), kind: "PARTNER", percent: 0 });
      }
    }
    const expenseLines = (filter: (e: Expense) => boolean) =>
      expenses.filter(filter).map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        expenseDate: e.expenseDate,
        categoryName: e.category?.name ?? null,
        notes: e.notes,
        createdByName: nameOf(e.createdByUserId),
      }));
    const personRows: ProfitShareRowDto[] = people.map((p) => {
      const lines = expenseLines((e) => e.chargedTo === ExpenseChargedTo.USER && e.chargedToUserId === p.userId);
      const share = round2((totals.profit * p.percent) / 100);
      const spent = round2(sum(lines.map((l) => l.amount)));
      return {
        kind: p.kind,
        userId: p.userId,
        name: p.name,
        percent: p.percent,
        share,
        expenses: spent,
        expenseLines: lines,
        broughtForward: null,
        netInHand: round2(share - spent),
      };
    });
    const companyLines = expenseLines((e) => e.chargedTo === ExpenseChargedTo.COMPANY);
    const companyPercent = round2(100 - sum(people.map((p) => p.percent)));
    // The company takes the remainder, so rounding never loses a paisa.
    const companyShare = round2(totals.profit - sum(personRows.map((r) => r.share)));
    const companySpent = round2(sum(companyLines.map((l) => l.amount)));
    const forward = await this.broughtForward(ctx, index);
    const companyRow: ProfitShareRowDto = {
      kind: "COMPANY",
      userId: null,
      name: ctx.company.name,
      percent: companyPercent,
      share: companyShare,
      expenses: companySpent,
      expenseLines: companyLines,
      broughtForward: forward,
      netInHand: round2(companyShare - companySpent + forward),
    };

    const status = this.status(ctx, cycle);
    const rateBlock = missingRate.size
      ? `No PKR rate is known for the extra lines on invoice ${[...missingRate].join(", ")} (they count as 0 until then) — edit and save the invoice once the exchange-rate service is back`
      : null;
    const blocked = this.generateBlockedReason(ctx, index) ?? rateBlock;
    const dto: ProfitCycleDto = {
      ...this.summary(ctx, cycle),
      generatedAt: null,
      generatedByName: null,
      orders: orderLines,
      byAccountHolder: sortGroups(byAh),
      byStockOwner: sortGroups(bySo),
      byThreePl: sortGroups(byTpl),
      totals,
      refunds,
      misc,
      shares: [companyRow, ...personRows],
      companyClosingBalance: companyRow.netInHand,
      estimate: status === "CURRENT" ? await this.estimate(companyId) : null,
      canGenerate: !blocked,
      generateBlockedReason: blocked,
      canDelete: false,
    };
    const live: Live = {
      dto,
      orderIds: orders.map((o) => o.id),
      refundOrderIds: refundOrders.map((o) => o.id),
      miscLineIds: miscRows.map((l) => l.id),
      expenseIds: expenses.map((e) => e.id),
    };
    ctx.memo.set(index, live);
    return live;
  }

  /**
   * Approx. company profit of every order without an Account Holder invoice yet: not cancelled, not refunded before it
   * shipped (never invoiced), not a refunded dropship order (never invoiced; nets to zero). A shipped STOCK refund counts
   * with its refund effect.
   */
  private async estimate(companyId: string) {
    const cached = this.estimateCache.get(companyId);
    if (cached && Date.now() - cached.at < ESTIMATE_TTL_MS) return cached.value;
    const orders = await this.orderModel.findAll({
      where: { companyId, accountHolderInvoiceId: null, status: { [Op.ne]: OrderStatus.CANCELLED } },
    });
    let profit = 0;
    let orderCount = 0;
    for (const order of orders) {
      let value = this.finance.companyProfitBreakdown(order).total;
      if (order.status === OrderStatus.REFUNDED) {
        if ((!order.shippedAt && !order.deliveredAt) || isDropshipOrder(order)) continue;
        value += refundCompanyImpact(order, this.finance.compute(order).companyRemainderFromOrder).net;
      }
      profit += value;
      orderCount += 1;
    }
    const value = { orderCount, profit: round2(profit) };
    this.estimateCache.set(companyId, { at: Date.now(), value });
    return value;
  }

  /**
   * The PKR rate saved on an Account Holder invoice. For one without (none could be found when it was saved): today's
   * rate, else the average rate locked on its own orders, else the last saved rate however old. Null = none known.
   */
  private async invoiceRate(invoice: Invoice): Promise<number | null> {
    if (invoice.pkrRate) return invoice.pkrRate;
    const currency = invoice.currency as Currency;
    if (invoice.currency === "PKR") return 1;
    try {
      const rate = (await this.exchangeRates.resolve([currency]))[currency];
      if (rate) return rate;
    } catch {
      // The rate service is down and no recent saved rate — fall back below.
    }
    const orders = await this.orderModel.unscoped().findAll({
      where: { accountHolderInvoiceId: invoice.id },
      attributes: ["exchangeRates"],
    });
    const locked = orders.map((o) => o.exchangeRates?.[currency]).filter((r): r is number => typeof r === "number" && r > 0);
    if (locked.length) return sum(locked) / locked.length;
    return this.exchangeRates.lastSaved(currency);
  }
}

function sortGroups<K>(map: Map<K, ProfitSourceGroupDto>) {
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function refundNote(order: Order): string {
  const asEntered = order.refundAmountOriginal != null && !!order.accountHolderCurrency;
  if (isFullRefund(order) || isDropshipOrder(order)) return "Full refund";
  const amount = asEntered ? order.refundAmountOriginal! : (order.refundAmount ?? 0);
  return `Partial refund of ${amount.toFixed(2)} ${asEntered ? order.accountHolderCurrency : "PKR"}`;
}

function displayName(user: User) {
  return user.name?.trim() || user.email;
}

function personSlug(cycle: ProfitCycleDto, userId: string) {
  const name = cycle.shares.find((s) => s.userId === userId)?.name ?? "person";
  return name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "person";
}

/** e.g. "Alpha Drop", 4, 2026 → AD-PS-2026-004. Its own counter, never reused. */
function formatStatementNumber(companyName: string, sequence: number, date: Date): string {
  const initials = companyName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "").charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 4);
  return `${initials || "CO"}-PS-${date.getFullYear()}-${String(sequence).padStart(3, "0")}`;
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
