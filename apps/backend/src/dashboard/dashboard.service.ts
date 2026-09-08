import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { OrderStatus, Role } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { SeatBilling } from "../database/models/seat-billing.model";
import { FinanceService } from "../finance/finance.service";
import { currentCycle } from "../invoices/billing-cycle.util";

const NON_COUNTABLE = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Order) private readonly orderModel: typeof Order,
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

  async accountHolder(companyId: string, userId: string) {
    const profile = await this.accountHolderProfileModel.findByPk(userId);
    if (!profile) throw new NotFoundException("Account Holder profile not found");

    const { start, end } = await this.cycle(companyId, profile.billingCycleStartDay);
    const orders = await this.orderModel.findAll({
      where: { companyId, accountHolderId: userId, createdAt: { [Op.gte]: start, [Op.lt]: end } },
    });

    const rows = orders.map((order) => ({
      orderId: order.id,
      ebayOrderRef: order.ebayOrderRef,
      status: order.status,
      profit: this.finance.compute(order).accountHolderProfit,
      payout: this.finance.compute(order).accountHolderPayout,
    }));

    const countable = orders.filter((o) => !NON_COUNTABLE.includes(o.status));
    const totalProfit = round2(countable.reduce((sum, o) => sum + this.finance.compute(o).accountHolderPayout, 0));

    return { cycleStart: start, cycleEnd: end, orderCount: orders.length, orders: rows, totalProfit };
  }

  async stockOwner(companyId: string, userId: string) {
    const profile = await this.stockOwnerProfileModel.findByPk(userId);
    if (!profile) throw new NotFoundException("Stock Owner profile not found");

    const { start, end } = await this.cycle(companyId, profile.billingCycleStartDay);
    const orders = await this.orderModel.findAll({
      where: { companyId, stockOwnerId: userId, createdAt: { [Op.gte]: start, [Op.lt]: end } },
    });

    const rows = orders.map((order) => {
      const f = this.finance.compute(order);
      return {
        orderId: order.id,
        ebayOrderRef: order.ebayOrderRef,
        status: order.status,
        quantity: order.quantity,
        net: f.stockOwnerNet,
      };
    });

    const countable = orders.filter((o) => !NON_COUNTABLE.includes(o.status));
    const itemsSold = countable.reduce((sum, o) => sum + o.quantity, 0);
    const totalProfit = round2(countable.reduce((sum, o) => sum + this.finance.compute(o).stockOwnerNet, 0));

    return { cycleStart: start, cycleEnd: end, itemsSold, orders: rows, totalProfit };
  }

  async threePl(companyId: string, userId: string) {
    const profile = await this.threePlProfileModel.findByPk(userId);
    if (!profile) throw new NotFoundException("3PL profile not found");

    const { start, end } = await this.cycle(companyId, profile.billingCycleStartDay);

    const toProcess = await this.orderModel.findAll({
      where: { companyId, threePlId: userId, status: { [Op.in]: [OrderStatus.PENDING, OrderStatus.PROCESSING] } },
    });
    const fulfilled = await this.orderModel.findAll({
      where: {
        companyId,
        threePlId: userId,
        status: { [Op.in]: [OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        createdAt: { [Op.gte]: start, [Op.lt]: end },
      },
    });

    const totalEarnings = round2(fulfilled.reduce((sum, o) => sum + this.finance.compute(o).threePlPayout, 0));

    return {
      cycleStart: start,
      cycleEnd: end,
      toProcess: toProcess.map((o) => ({ orderId: o.id, ebayOrderRef: o.ebayOrderRef, status: o.status })),
      fulfilled: fulfilled.map((o) => ({ orderId: o.id, ebayOrderRef: o.ebayOrderRef, status: o.status })),
      totalEarnings,
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

    const userIds = new Set<string>();
    for (const o of allOrders) {
      userIds.add(o.accountHolderId);
      userIds.add(o.stockOwnerId);
      if (o.threePlId) userIds.add(o.threePlId);
    }
    const users = userIds.size
      ? await this.userModel.findAll({ where: { id: Array.from(userIds) }, include: [UserRoleAssignment] })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const nameOf = (id: string) => userById.get(id)?.name || userById.get(id)?.email || id;

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

    return {
      cycleStart: start,
      cycleEnd: end,
      totalCompanyProfit,
      orderCount: orders.length,
      ordersByStatus,
      ordersPerUser: Array.from(ordersPerUser.values()),
      profitSeries,
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
    return currentCycle(anchor, new Date());
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
