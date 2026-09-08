import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { InvoiceStatus, OrderStatus, Role } from "@ebay-order-management/shared";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { Invoice } from "../database/models/invoice.model";
import { InvoiceLineItem } from "../database/models/invoice-line-item.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { FinanceService } from "../finance/finance.service";
import { lastCompletedCycle, toDateOnly } from "./billing-cycle.util";
import { GenerateInvoiceDto } from "./dto/generate-invoice.dto";
import type { JwtPayload } from "../auth/jwt.strategy";

const NON_COUNTABLE = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(Invoice) private readonly invoiceModel: typeof Invoice,
    @InjectModel(InvoiceLineItem) private readonly lineItemModel: typeof InvoiceLineItem,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerProfileModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlProfileModel: typeof ThreePlProfile,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    private readonly finance: FinanceService,
  ) {}

  async list(companyId: string, userId?: string) {
    return this.invoiceModel.findAll({
      where: { companyId, ...(userId ? { userId } : {}) },
      include: [InvoiceLineItem],
      order: [["generatedAt", "DESC"]],
    });
  }

  async generate(companyId: string, requester: JwtPayload, dto: GenerateInvoiceDto) {
    this.assertCanGenerate(requester, dto);

    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");

    const anchorDay = await this.resolveAnchorDay(dto.userId, dto.role, company.billingAnchorDay);
    const { start, end } = lastCompletedCycle(anchorDay, new Date());
    const periodStart = toDateOnly(start);
    const periodEnd = toDateOnly(end);

    const existing = await this.invoiceModel.findOne({
      where: { userId: dto.userId, role: dto.role, periodStart, periodEnd },
    });
    if (existing) {
      throw new BadRequestException("An invoice for this period has already been generated");
    }

    const orders = await this.fetchOrdersForRole(companyId, dto.userId, dto.role, start, end);
    const lineItemRows = await this.buildLineItems(dto.userId, dto.role, orders);
    const clawbackRows = await this.buildClawbacks(dto.userId, dto.role, companyId);

    const allRows = [...lineItemRows, ...clawbackRows];
    const totalAmount = round2(allRows.reduce((sum, row) => sum + row.netAmount, 0));

    const invoice = await this.invoiceModel.create({
      companyId,
      userId: dto.userId,
      role: dto.role,
      periodStart,
      periodEnd,
      status: InvoiceStatus.UNPAID,
      totalAmount,
      generatedByUserId: requester.sub,
      generatedAt: new Date(),
    });

    await this.lineItemModel.bulkCreate(allRows.map((row) => ({ ...row, invoiceId: invoice.id })));

    return this.invoiceModel.findByPk(invoice.id, { include: [InvoiceLineItem] });
  }

  async markPaid(companyId: string, invoiceId: string) {
    const invoice = await this.invoiceModel.findOne({ where: { id: invoiceId, companyId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    await invoice.save();
    return invoice;
  }

  private assertCanGenerate(requester: JwtPayload, dto: GenerateInvoiceDto) {
    const isManager = requester.roles.some((r) => r === Role.ADMIN || r === Role.SUPER_ADMIN);
    const isSelfService = requester.sub === dto.userId && requester.roles.includes(dto.role);
    if (isManager || isSelfService) return;
    // Staff/Platform-Staff-with-canGenerateInvoices is checked at the controller via PermissionsGuard.
    if (requester.roles.includes(Role.STAFF) || requester.roles.includes(Role.PLATFORM_STAFF)) return;
    throw new ForbiddenException("You cannot generate an invoice for this user");
  }

  private async resolveAnchorDay(userId: string, role: Role, companyAnchorDay: number): Promise<number> {
    if (role === Role.ACCOUNT_HOLDER) {
      const p = await this.accountHolderProfileModel.findByPk(userId);
      return p?.billingCycleStartDay ?? companyAnchorDay;
    }
    if (role === Role.STOCK_OWNER) {
      const p = await this.stockOwnerProfileModel.findByPk(userId);
      return p?.billingCycleStartDay ?? companyAnchorDay;
    }
    if (role === Role.THREE_PL) {
      const p = await this.threePlProfileModel.findByPk(userId);
      return p?.billingCycleStartDay ?? companyAnchorDay;
    }
    return companyAnchorDay;
  }

  private async fetchOrdersForRole(companyId: string, userId: string, role: Role, start: Date, end: Date) {
    const where: Record<string, unknown> = {
      companyId,
      createdAt: { [Op.gte]: start, [Op.lt]: end },
      status: { [Op.notIn]: NON_COUNTABLE },
    };

    if (role === Role.ACCOUNT_HOLDER) where.accountHolderId = userId;
    else if (role === Role.STOCK_OWNER) where.stockOwnerId = userId;
    else if (role === Role.THREE_PL) where.threePlId = userId;
    // STAFF: no extra filter — every company order counts toward their revenue share.

    return this.orderModel.findAll({ where });
  }

  private async buildLineItems(userId: string, role: Role, orders: Order[]) {
    if (role === Role.STAFF) {
      const staffProfile = await this.staffProfileModel.findByPk(userId);
      const sharePercent = staffProfile?.hasRevenueShare ? (staffProfile.sharePercent ?? 0) : 0;
      return orders.map((order) => {
        const companyProfit = this.finance.companyProfit(order);
        const net = round2(companyProfit * (sharePercent / 100));
        return {
          orderId: order.id,
          description: `Order ${order.ebayOrderRef} — ${sharePercent}% of company profit`,
          grossAmount: companyProfit,
          deductionAmount: round2(companyProfit - net),
          netAmount: net,
          isAdjustment: false,
        };
      });
    }

    return orders.map((order) => {
      const f = this.finance.compute(order);
      if (role === Role.ACCOUNT_HOLDER) {
        return {
          orderId: order.id,
          description: `Order ${order.ebayOrderRef}`,
          grossAmount: f.accountHolderProfit,
          deductionAmount: round2(f.accountHolderProfit - f.accountHolderPayout),
          netAmount: f.accountHolderPayout,
          isAdjustment: false,
        };
      }
      if (role === Role.STOCK_OWNER) {
        return {
          orderId: order.id,
          description: `Order ${order.ebayOrderRef} — ${order.quantity} unit(s)`,
          grossAmount: f.stockOwnerGross,
          deductionAmount: f.stockOwnerShareCut,
          netAmount: f.stockOwnerNet,
          isAdjustment: false,
        };
      }
      // THREE_PL
      return {
        orderId: order.id,
        description: `Order ${order.ebayOrderRef} — fulfillment fee`,
        grossAmount: f.threePlPayout,
        deductionAmount: 0,
        netAmount: f.threePlPayout,
        isAdjustment: false,
      };
    });
  }

  /**
   * Finds orders that were already counted on a prior invoice for this user+role
   * and have since been REFUNDED, and produces a negative clawback line for any
   * that haven't already been clawed back.
   */
  private async buildClawbacks(userId: string, role: Role, companyId: string) {
    const priorInvoices = await this.invoiceModel.findAll({
      where: { userId, role, companyId },
      include: [InvoiceLineItem],
    });

    const countedOrderLines = new Map<string, InvoiceLineItem>();
    const alreadyClawedBack = new Set<string>();

    for (const invoice of priorInvoices) {
      for (const line of invoice.lineItems) {
        if (!line.orderId) continue;
        if (line.isAdjustment) alreadyClawedBack.add(line.orderId);
        else countedOrderLines.set(line.orderId, line);
      }
    }

    const candidateOrderIds = [...countedOrderLines.keys()].filter((id) => !alreadyClawedBack.has(id));
    if (candidateOrderIds.length === 0) return [];

    const refundedOrders = await this.orderModel.findAll({
      where: { id: { [Op.in]: candidateOrderIds }, status: OrderStatus.REFUNDED },
    });

    return refundedOrders.map((order) => {
      const original = countedOrderLines.get(order.id)!;
      return {
        orderId: order.id,
        description: `Refund adjustment: Order ${order.ebayOrderRef}`,
        grossAmount: 0,
        deductionAmount: original.netAmount,
        netAmount: round2(-original.netAmount),
        isAdjustment: true,
      };
    });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
