import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { OrderStatus, ProductFulfillmentType, Role } from "@ebay-order-management/shared";
import { Order } from "../database/models/order.model";
import { Company } from "../database/models/company.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { BillingService } from "../billing/billing.service";
import { FinanceService } from "../finance/finance.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { daysInStatus, isOrderStale } from "./order-staleness.util";

const TERMINAL_RESTOCK_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];
// 3PLs no longer see PENDING orders at all (a manager must make that first move), so they only
// ever self-advance PROCESSING -> SHIPPED.
const THREE_PL_ALLOWED_FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PROCESSING]: OrderStatus.SHIPPED,
};
const MANAGER_ROLES = [Role.ADMIN, Role.STAFF, Role.SUPER_ADMIN, Role.PLATFORM_STAFF];

export interface OrderListFilters {
  accountHolderId?: string;
  threePlId?: string;
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerProfileModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlProfileModel: typeof ThreePlProfile,
    private readonly billingService: BillingService,
    private readonly financeService: FinanceService,
  ) {}

  async list(companyId: string, requester: JwtPayload, filters: OrderListFilters = {}) {
    const where: Record<string, unknown> = { companyId };
    const isManager = requester.roles.some((r) => MANAGER_ROLES.includes(r));

    const isThreePl = requester.roles.includes(Role.THREE_PL);
    if (!isManager) {
      if (requester.roles.includes(Role.ACCOUNT_HOLDER)) where.accountHolderId = requester.sub;
      else if (requester.roles.includes(Role.STOCK_OWNER)) where.stockOwnerId = requester.sub;
      else if (isThreePl) where.threePlId = requester.sub;
    } else {
      if (filters.accountHolderId) where.accountHolderId = filters.accountHolderId;
      if (filters.threePlId) where.threePlId = filters.threePlId;
    }

    if (filters.status) where.status = filters.status;
    // 3PLs only ever see an order once it's been assigned to them and has left PENDING — a manager
    // makes the initial PENDING -> PROCESSING move.
    if (isThreePl && !isManager) {
      where.status = filters.status && filters.status !== OrderStatus.PENDING ? filters.status : { [Op.ne]: OrderStatus.PENDING };
    }
    if (filters.startDate || filters.endDate) {
      const orderDate: Record<symbol, string> = {};
      if (filters.startDate) orderDate[Op.gte] = filters.startDate;
      if (filters.endDate) orderDate[Op.lte] = filters.endDate;
      where.orderDate = orderDate;
    }

    const orders = await this.orderModel.findAll({ where, order: [["createdAt", "DESC"]] });
    const staleOrderDays = await this.staleOrderDays(companyId);
    const now = new Date();
    return orders.map((order) => this.withStaleness(order, staleOrderDays, now, isManager));
  }

  async get(companyId: string, id: string) {
    const order = await this.orderModel.findOne({ where: { id, companyId } });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  private async staleOrderDays(companyId: string): Promise<number> {
    const company = await this.companyModel.findByPk(companyId);
    return company?.staleOrderDays ?? 3;
  }

  private withStaleness(order: Order, staleOrderDays: number, now: Date, isManager: boolean) {
    return {
      ...order.toJSON(),
      daysInStatus: daysInStatus(order.statusChangedAt, now),
      stale: isOrderStale(order.status, order.statusChangedAt, staleOrderDays, now),
      // Company profit is a manager-only figure — Account Holders/Stock Owners/3PLs only ever see their own payout.
      companyProfit: isManager ? this.financeService.companyProfit(order) : undefined,
    };
  }

  async create(companyId: string, dto: CreateOrderDto) {
    const product = await this.productModel.findOne({ where: { id: dto.productId, companyId } });
    if (!product) throw new NotFoundException("Product not found");

    if (await this.billingService.isSeatBlocked(dto.accountHolderId)) {
      throw new ForbiddenException("This Account Holder's seat is blocked pending payment");
    }
    if (product.stockOwnerId && (await this.billingService.isSeatBlocked(product.stockOwnerId))) {
      throw new ForbiddenException("This Stock Owner's seat is blocked pending payment");
    }

    let threePlId: string | null = null;
    if (product.fulfillmentType === ProductFulfillmentType.STOCK) {
      threePlId = dto.threePlId ?? product.threePlId;
      if (!threePlId) {
        throw new BadRequestException("A 3PL must be assigned for STOCK fulfillment products");
      }
    } else if (dto.threePlId) {
      threePlId = dto.threePlId;
    }
    if (threePlId && (await this.billingService.isSeatBlocked(threePlId))) {
      throw new ForbiddenException("This 3PL's seat is blocked pending payment");
    }

    const accountHolderProfile = await this.accountHolderProfileModel.findByPk(dto.accountHolderId);
    if (!accountHolderProfile) {
      throw new BadRequestException("Account Holder profile not found");
    }
    // DROPSHIP products carry no Stock Owner — there's nothing to snapshot for that side of the order.
    const stockOwnerProfile = product.stockOwnerId
      ? await this.stockOwnerProfileModel.findByPk(product.stockOwnerId)
      : null;
    if (product.stockOwnerId && !stockOwnerProfile) {
      throw new BadRequestException("Stock Owner profile not found");
    }

    let threePlPriceChargedSnapshot: number | null = null;
    let threePlPayoutSnapshot: number | null = null;
    if (threePlId) {
      const threePlProfile = await this.threePlProfileModel.findByPk(threePlId);
      if (!threePlProfile) throw new BadRequestException("3PL profile not found");
      if (threePlProfile.fulfillmentType !== product.fulfillmentType) {
        throw new BadRequestException(
          `The selected 3PL handles ${threePlProfile.fulfillmentType} fulfillment, but this product is ${product.fulfillmentType}`,
        );
      }
      threePlPriceChargedSnapshot = accountHolderProfile.threePlPriceCharged ?? 0;
      threePlPayoutSnapshot = threePlProfile.payoutPerOrder;
    }

    const order = await this.orderModel.create({
      companyId,
      accountHolderId: dto.accountHolderId,
      stockOwnerId: product.stockOwnerId,
      productId: product.id,
      quantity: dto.quantity,
      threePlId,
      status: OrderStatus.PENDING,
      statusChangedAt: new Date(),
      orderDate: dto.orderDate ?? new Date().toISOString().slice(0, 10),
      ebayOrderRef: dto.ebayOrderRef,
      trackingNumber: dto.trackingNumber ?? null,
      buyerDetails: dto.buyerDetails,
      ebayNetProceeds: dto.ebayNetProceeds,
      shippingCost: dto.shippingCost ?? 0,
      supplierUrl: dto.supplierUrl ?? null,
      // DROPSHIP: no product-level price to snapshot yet — the assigned 3PL enters the buy price
      // once they pick up the order (see setDropshipBuyPrice below).
      sellPriceSnapshot: product.sellPrice,
      buyPriceSnapshot: product.buyPrice,
      stockOwnerCostSnapshot: product.stockOwnerCost,
      threePlPriceChargedSnapshot,
      threePlPayoutSnapshot,
      accountHolderSharePercentSnapshot: accountHolderProfile.sharePercent,
      stockOwnerPayoutModeSnapshot: stockOwnerProfile?.payoutMode ?? null,
      stockOwnerSharePercentSnapshot: stockOwnerProfile?.sharePercent ?? null,
    });

    // DROPSHIP products hold no stock to decrement.
    if (product.fulfillmentType === ProductFulfillmentType.STOCK) {
      product.stockQuantity -= dto.quantity;
      await product.save();
    }

    return order;
  }

  async update(companyId: string, id: string, dto: UpdateOrderDto) {
    const order = await this.get(companyId, id);

    if (dto.orderDate !== undefined) order.orderDate = dto.orderDate;
    if (dto.accountHolderId !== undefined) order.accountHolderId = dto.accountHolderId;
    if (dto.ebayOrderRef !== undefined) order.ebayOrderRef = dto.ebayOrderRef;
    if (dto.trackingNumber !== undefined) order.trackingNumber = dto.trackingNumber;
    if (dto.buyerDetails !== undefined) order.buyerDetails = dto.buyerDetails;
    if (dto.ebayNetProceeds !== undefined) order.ebayNetProceeds = dto.ebayNetProceeds;
    if (dto.shippingCost !== undefined) order.shippingCost = dto.shippingCost;
    if (dto.supplierUrl !== undefined) order.supplierUrl = dto.supplierUrl;

    await order.save();
    return order;
  }

  /** Lets the assigned 3PL fill in the buy price for a DROPSHIP order once they can see it (status past PENDING). */
  async setDropshipBuyPrice(companyId: string, requester: JwtPayload, id: string, buyPrice: number) {
    const order = await this.get(companyId, id);
    if (order.threePlId !== requester.sub) {
      throw new ForbiddenException("This order is not assigned to you");
    }
    if (order.status === OrderStatus.PENDING) {
      throw new ForbiddenException("This order is not visible to 3PL users yet");
    }

    const product = await this.productModel.findByPk(order.productId);
    if (!product || product.fulfillmentType !== ProductFulfillmentType.DROPSHIP) {
      throw new BadRequestException("Buy price can only be entered for DROPSHIP orders");
    }

    order.buyPriceSnapshot = buyPrice;
    // The buy price the 3PL enters IS their payout for a DROPSHIP order — no separate rate.
    order.threePlPayoutSnapshot = buyPrice;
    await order.save();
    return order;
  }

  async uploadShippingLabel(companyId: string, id: string, shippingLabelUrl: string) {
    const order = await this.get(companyId, id);
    order.shippingLabelUrl = shippingLabelUrl;
    await order.save();
    return order;
  }

  async updateStatus(companyId: string, requester: JwtPayload, id: string, dto: UpdateOrderStatusDto) {
    const order = await this.get(companyId, id);
    this.assertStatusTransitionAllowed(order, requester, dto.status);

    order.status = dto.status;
    order.statusChangedAt = new Date();
    if (dto.status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    }

    if (TERMINAL_RESTOCK_STATUSES.includes(dto.status) && !order.restocked) {
      const product = await this.productModel.findByPk(order.productId);
      if (product && product.fulfillmentType === ProductFulfillmentType.STOCK) {
        product.stockQuantity += order.quantity;
        await product.save();
      }
      order.restocked = true;
    }

    await order.save();
    return order;
  }

  private assertStatusTransitionAllowed(order: Order, requester: JwtPayload, next: OrderStatus) {
    const isManager = requester.roles.some(
      (r) => r === Role.ADMIN || r === Role.STAFF || r === Role.SUPER_ADMIN || r === Role.PLATFORM_STAFF,
    );
    if (isManager) return;

    const isAssignedThreePl = requester.roles.includes(Role.THREE_PL) && order.threePlId === requester.sub;
    if (isAssignedThreePl && THREE_PL_ALLOWED_FORWARD[order.status] === next) {
      return;
    }

    throw new ForbiddenException("You do not have permission to make this status change");
  }
}
