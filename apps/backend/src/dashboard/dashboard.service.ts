import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { OrderStatus, Role, UserStatus } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { Product } from "../database/models/product.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { SeatBilling } from "../database/models/seat-billing.model";
import { FinanceService } from "../finance/finance.service";
import { currentCycle, toDateOnly } from "../invoices/billing-cycle.util";
import { daysInStatus, isOrderStale } from "../orders/order-staleness.util";

const NON_COUNTABLE = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];
const OPEN_STATUSES = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.SHIPPED];

export interface DashboardOrderFilters {
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerProfileModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlProfileModel: typeof ThreePlProfile,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(SeatBilling) private readonly seatBillingModel: typeof SeatBilling,
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly finance: FinanceService,
  ) {}

  async seatStatus(userId: string) {
    const billing = await this.seatBillingModel.findByPk(userId);
    return {
      paidThroughDate: billing?.paidThroughDate ?? null,
      blocked: billing?.blocked ?? false,
    };
  }

  async accountHolder(companyId: string, userId: string, filters: DashboardOrderFilters = {}) {
    const profile = await this.accountHolderProfileModel.findByPk(userId);
    if (!profile) throw new NotFoundException("Account Holder profile not found");

    const cycle = await this.cycle(companyId, profile.billingCycleStartDay);
    const cycleOrders = await this.orderModel.findAll({
      where: { companyId, accountHolderId: userId, createdAt: { [Op.gte]: cycle.start, [Op.lt]: cycle.end } },
    });
    const countable = cycleOrders.filter((o) => !NON_COUNTABLE.includes(o.status));
    const totalProfit = round2(countable.reduce((sum, o) => sum + this.finance.compute(o).accountHolderPayout, 0));
    const payoutByDay = buildDailySeries(cycle.start, cycle.end, countable, (o) => this.finance.compute(o).accountHolderPayout);
    const ordersByDay = buildDailySeries(cycle.start, cycle.end, cycleOrders, () => 1);

    const range = resolveRange(filters, cycle);
    const listWhere: Record<string, unknown> = {
      companyId,
      accountHolderId: userId,
      createdAt: { [Op.gte]: range.start, [Op.lt]: range.end },
    };
    if (filters.status) listWhere.status = filters.status;
    const listOrders = await this.orderModel.findAll({ where: listWhere, order: [["createdAt", "DESC"]] });

    const rows = listOrders.map((order) => ({
      orderId: order.id,
      ebayOrderRef: order.ebayOrderRef,
      status: order.status,
      productId: order.productId,
      quantity: order.quantity,
      profit: this.finance.compute(order).accountHolderProfit,
      payout: this.finance.compute(order).accountHolderPayout,
    }));

    return {
      cycleStart: toDateOnly(cycle.start),
      cycleEnd: toDateOnly(cycle.end),
      listStart: toDateOnly(range.start),
      listEnd: toDateOnly(lastInclusiveDay(range.end)),
      orderCount: cycleOrders.length,
      orders: rows,
      totalProfit,
      payoutByDay,
      ordersByDay,
    };
  }

  async stockOwner(companyId: string, userId: string, filters: DashboardOrderFilters = {}) {
    const profile = await this.stockOwnerProfileModel.findByPk(userId);
    if (!profile) throw new NotFoundException("Stock Owner profile not found");

    const cycle = await this.cycle(companyId, profile.billingCycleStartDay);
    const cycleOrders = await this.orderModel.findAll({
      where: { companyId, stockOwnerId: userId, createdAt: { [Op.gte]: cycle.start, [Op.lt]: cycle.end } },
    });
    const countable = cycleOrders.filter((o) => !NON_COUNTABLE.includes(o.status));
    const itemsSold = countable.reduce((sum, o) => sum + o.quantity, 0);
    const totalProfit = round2(countable.reduce((sum, o) => sum + this.finance.compute(o).stockOwnerNet, 0));
    const itemsSoldByDay = buildDailySeries(cycle.start, cycle.end, countable, (o) => o.quantity);

    const byProductMap = new Map<string, { productId: string; quantity: number; net: number }>();
    for (const order of countable) {
      const entry = byProductMap.get(order.productId) ?? { productId: order.productId, quantity: 0, net: 0 };
      entry.quantity += order.quantity;
      entry.net = round2(entry.net + this.finance.compute(order).stockOwnerNet);
      byProductMap.set(order.productId, entry);
    }
    const byProduct = Array.from(byProductMap.values()).sort((a, b) => b.quantity - a.quantity);

    const range = resolveRange(filters, cycle);
    const listWhere: Record<string, unknown> = {
      companyId,
      stockOwnerId: userId,
      createdAt: { [Op.gte]: range.start, [Op.lt]: range.end },
    };
    if (filters.status) listWhere.status = filters.status;
    const listOrders = await this.orderModel.findAll({ where: listWhere, order: [["createdAt", "DESC"]] });

    const rows = listOrders.map((order) => {
      const f = this.finance.compute(order);
      return {
        orderId: order.id,
        ebayOrderRef: order.ebayOrderRef,
        status: order.status,
        productId: order.productId,
        quantity: order.quantity,
        net: f.stockOwnerNet,
      };
    });

    return {
      cycleStart: toDateOnly(cycle.start),
      cycleEnd: toDateOnly(cycle.end),
      listStart: toDateOnly(range.start),
      listEnd: toDateOnly(lastInclusiveDay(range.end)),
      itemsSold,
      orders: rows,
      totalProfit,
      itemsSoldByDay,
      byProduct,
    };
  }

  async threePl(companyId: string, userId: string, filters: DashboardOrderFilters = {}) {
    const profile = await this.threePlProfileModel.findByPk(userId);
    if (!profile) throw new NotFoundException("3PL profile not found");

    const cycle = await this.cycle(companyId, profile.billingCycleStartDay);
    const range = resolveRange(filters, cycle);

    const cycleFulfilled = await this.orderModel.findAll({
      where: {
        companyId,
        threePlId: userId,
        status: { [Op.in]: [OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        createdAt: { [Op.gte]: cycle.start, [Op.lt]: cycle.end },
      },
    });
    const totalEarnings = round2(cycleFulfilled.reduce((sum, o) => sum + this.finance.compute(o).threePlPayout, 0));
    const fulfilledByDay = buildDailySeries(cycle.start, cycle.end, cycleFulfilled, () => 1);

    const toProcessStatuses = filters.status
      ? [OrderStatus.PENDING, OrderStatus.PROCESSING].filter((s) => s === filters.status)
      : [OrderStatus.PENDING, OrderStatus.PROCESSING];
    const toProcess = toProcessStatuses.length
      ? await this.orderModel.findAll({
          where: {
            companyId,
            threePlId: userId,
            status: { [Op.in]: toProcessStatuses },
            createdAt: { [Op.gte]: range.start, [Op.lt]: range.end },
          },
          order: [["createdAt", "DESC"]],
        })
      : [];

    const fulfilledStatuses = filters.status
      ? [OrderStatus.SHIPPED, OrderStatus.DELIVERED].filter((s) => s === filters.status)
      : [OrderStatus.SHIPPED, OrderStatus.DELIVERED];
    const fulfilled = fulfilledStatuses.length
      ? await this.orderModel.findAll({
          where: {
            companyId,
            threePlId: userId,
            status: { [Op.in]: fulfilledStatuses },
            createdAt: { [Op.gte]: range.start, [Op.lt]: range.end },
          },
          order: [["createdAt", "DESC"]],
        })
      : [];

    const now = new Date();
    const mapRow = (o: Order) => ({
      orderId: o.id,
      ebayOrderRef: o.ebayOrderRef,
      status: o.status,
      productId: o.productId,
      quantity: o.quantity,
      shippingLabelUrl: o.shippingLabelUrl,
      daysInStatus: daysInStatus(o.statusChangedAt, now),
      stale: isOrderStale(o.status, o.statusChangedAt, cycle.staleOrderDays, now),
    });

    return {
      cycleStart: toDateOnly(cycle.start),
      cycleEnd: toDateOnly(cycle.end),
      listStart: toDateOnly(range.start),
      listEnd: toDateOnly(lastInclusiveDay(range.end)),
      toProcess: toProcess.map(mapRow),
      fulfilled: fulfilled.map(mapRow),
      totalEarnings,
      fulfilledByDay,
    };
  }

  async staff(companyId: string) {
    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");

    const { start, end } = currentCycle(company.billingAnchorDay, new Date());
    // Includes CANCELLED/REFUNDED here — the status board needs to show every order this cycle.
    const allOrders = await this.orderModel.findAll({
      where: { companyId, createdAt: { [Op.gte]: start, [Op.lt]: end } },
      order: [["createdAt", "ASC"]],
    });
    const orders = allOrders.filter((o) => !NON_COUNTABLE.includes(o.status));

    const salesByAccountHolder = new Map<string, { orderCount: number; profit: number }>();
    for (const order of orders) {
      const entry = salesByAccountHolder.get(order.accountHolderId) ?? { orderCount: 0, profit: 0 };
      entry.orderCount += 1;
      entry.profit = round2(entry.profit + this.finance.companyProfit(order));
      salesByAccountHolder.set(order.accountHolderId, entry);
    }

    const totalCompanyProfit = round2(orders.reduce((sum, o) => sum + this.finance.companyProfit(o), 0));

    // Fetched once, company-wide, so it covers every possible order participant plus the user-roster stats below.
    const allCompanyUsers = await this.userModel.findAll({ where: { companyId }, include: [UserRoleAssignment] });
    const userById = new Map(allCompanyUsers.map((u) => [u.id, u]));
    const nameOf = (id: string) => userById.get(id)?.name || userById.get(id)?.email || id;

    const userStats = {
      active: allCompanyUsers.filter((u) => u.status === UserStatus.ACTIVE).length,
      disabled: allCompanyUsers.filter((u) => u.status === UserStatus.DISABLED).length,
      invited: allCompanyUsers.filter((u) => u.status === UserStatus.INVITED).length,
      byRole: Object.fromEntries(
        Object.values(Role).map((role) => [
          role,
          allCompanyUsers.filter((u) => u.roleAssignments.some((ra) => ra.role === role)).length,
        ]),
      ),
    };

    const products = await this.productModel.findAll({ where: { companyId } });
    const productsPerStockOwnerMap = new Map<string, { stockOwnerId: string; productCount: number; totalStockQuantity: number }>();
    for (const product of products) {
      const entry = productsPerStockOwnerMap.get(product.stockOwnerId) ?? {
        stockOwnerId: product.stockOwnerId,
        productCount: 0,
        totalStockQuantity: 0,
      };
      entry.productCount += 1;
      entry.totalStockQuantity += product.stockQuantity;
      productsPerStockOwnerMap.set(product.stockOwnerId, entry);
    }
    const productsPerStockOwner = Array.from(productsPerStockOwnerMap.values()).map((entry) => ({
      ...entry,
      name: nameOf(entry.stockOwnerId),
    }));

    // Every currently-open order company-wide (not just this cycle) that's sat in status too long.
    const openOrders = await this.orderModel.findAll({
      where: { companyId, status: { [Op.in]: OPEN_STATUSES } },
      order: [["statusChangedAt", "ASC"]],
    });
    const now = new Date();
    const agingOrders = openOrders
      .filter((o) => isOrderStale(o.status, o.statusChangedAt, company.staleOrderDays, now))
      .map((o) => ({
        orderId: o.id,
        ebayOrderRef: o.ebayOrderRef,
        status: o.status,
        productId: o.productId,
        daysInStatus: daysInStatus(o.statusChangedAt, now),
        accountHolderName: nameOf(o.accountHolderId),
        stockOwnerName: nameOf(o.stockOwnerId),
        threePlName: o.threePlId ? nameOf(o.threePlId) : null,
      }));

    const statuses = Object.values(OrderStatus);
    const ordersPerUser = new Map<
      string,
      { userId: string; name: string; role: Role; byStatus: Record<string, number> }
    >();
    const addRow = (userId: string, role: Role, status: OrderStatus) => {
      const key = `${userId}:${role}`;
      const row =
        ordersPerUser.get(key) ??
        {
          userId,
          name: nameOf(userId),
          role,
          byStatus: Object.fromEntries(statuses.map((s) => [s, 0])),
        };
      row.byStatus[status] += 1;
      ordersPerUser.set(key, row);
    };
    for (const o of allOrders) {
      addRow(o.accountHolderId, Role.ACCOUNT_HOLDER, o.status);
      addRow(o.stockOwnerId, Role.STOCK_OWNER, o.status);
      if (o.threePlId) addRow(o.threePlId, Role.THREE_PL, o.status);
    }

    const ordersByStatus = Object.fromEntries(
      statuses.map((s) => [s, allOrders.filter((o) => o.status === s).length]),
    );

    // Cumulative profit-to-date, split by source, one point per day from cycle start through today.
    const today = new Date();
    const lastDay = today < end ? today : new Date(end.getTime() - 1);
    const profitSeries: { date: string; accountHolders: number; threePl: number; stockOwners: number }[] = [];
    let cAh = 0;
    let c3pl = 0;
    let cStock = 0;
    for (let d = new Date(start); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const dayEnd = new Date(d);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayOrders = orders.filter((o) => o.createdAt >= d && o.createdAt < dayEnd);
      for (const o of dayOrders) {
        const f = this.finance.compute(o);
        cAh = round2(cAh + f.companyRemainderFromOrder);
        c3pl = round2(c3pl + f.threePlMarkup);
        cStock = round2(cStock + f.stockOwnerShareCut + f.productMarkup);
      }
      profitSeries.push({ date: d.toISOString().slice(0, 10), accountHolders: cAh, threePl: c3pl, stockOwners: cStock });
    }

    // Orders placed per day this cycle (not cumulative), overall and split per account holder.
    const ordersPerDay = buildDailySeries(start, end, allOrders, () => 1);
    const accountHolderIds = Array.from(new Set(orders.map((o) => o.accountHolderId)));
    const ordersPerDayByAccountHolder = accountHolderIds.map((accountHolderId) => ({
      accountHolderId,
      name: nameOf(accountHolderId),
      series: buildDailySeries(
        start,
        end,
        allOrders.filter((o) => o.accountHolderId === accountHolderId),
        () => 1,
      ),
    }));

    return {
      cycleStart: start,
      cycleEnd: end,
      totalCompanyProfit,
      orderCount: orders.length,
      ordersByStatus,
      ordersPerUser: Array.from(ordersPerUser.values()),
      profitSeries,
      ordersPerDay,
      ordersPerDayByAccountHolder,
      userStats,
      productsPerStockOwner,
      agingOrders,
      staleOrderDays: company.staleOrderDays,
      salesByAccountHolder: Array.from(salesByAccountHolder.entries()).map(([accountHolderId, v]) => ({
        accountHolderId,
        name: nameOf(accountHolderId),
        ...v,
      })),
    };
  }

  private async cycle(companyId: string, billingCycleStartDay: number) {
    const company = await this.companyModel.findByPk(companyId);
    const anchor = billingCycleStartDay ?? company?.billingAnchorDay ?? 1;
    return { ...currentCycle(anchor, new Date()), staleOrderDays: company?.staleOrderDays ?? 3 };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Resolves the active list range: explicit filter dates win, otherwise the billing cycle. `endDate` is inclusive. */
function resolveRange(filters: DashboardOrderFilters, cycle: { start: Date; end: Date }): { start: Date; end: Date } {
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : cycle.start;
  const end = filters.endDate ? inclusiveEnd(new Date(`${filters.endDate}T00:00:00`)) : cycle.end;
  return { start, end };
}

/** Converts an inclusive calendar date into the exclusive upper bound covering that whole day. */
function inclusiveEnd(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

/** Converts an exclusive upper bound back into the last inclusive calendar date it covers, for display. */
function lastInclusiveDay(exclusiveEnd: Date): Date {
  return new Date(exclusiveEnd.getTime() - 24 * 60 * 60 * 1000);
}

/** Buckets `orders` by calendar day (by createdAt) from `start` through `end` (exclusive) or today, whichever is sooner. */
function buildDailySeries(start: Date, end: Date, orders: Order[], valueFn: (o: Order) => number): { date: string; value: number }[] {
  const today = new Date();
  const lastDay = today < end ? today : new Date(end.getTime() - 1);
  const series: { date: string; value: number }[] = [];
  for (let d = new Date(start); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dayEnd = new Date(d);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayOrders = orders.filter((o) => o.createdAt >= d && o.createdAt < dayEnd);
    const value = round2(dayOrders.reduce((sum, o) => sum + valueFn(o), 0));
    series.push({ date: d.toISOString().slice(0, 10), value });
  }
  return series;
}
