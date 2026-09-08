import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { OrderStatus, ProductFulfillmentType, Role } from "@ebay-order-management/shared";
import { Order } from "../database/models/order.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { BillingService } from "../billing/billing.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";

const TERMINAL_RESTOCK_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];
const THREE_PL_ALLOWED_FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PENDING]: OrderStatus.PROCESSING,
  [OrderStatus.PROCESSING]: OrderStatus.SHIPPED,
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerProfileModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlProfileModel: typeof ThreePlProfile,
    private readonly billingService: BillingService,
  ) {}

  async list(companyId: string, requester: JwtPayload) {
    const where: Record<string, unknown> = { companyId };

    if (!requester.roles.some((r) => r === Role.ADMIN || r === Role.STAFF || r === Role.SUPER_ADMIN || r === Role.PLATFORM_STAFF)) {
      if (requester.roles.includes(Role.ACCOUNT_HOLDER)) where.accountHolderId = requester.sub;
      else if (requester.roles.includes(Role.STOCK_OWNER)) where.stockOwnerId = requester.sub;
      else if (requester.roles.includes(Role.THREE_PL)) where.threePlId = requester.sub;
    }

    return this.orderModel.findAll({ where, order: [["createdAt", "DESC"]] });
  }

  async get(companyId: string, id: string) {
    const order = await this.orderModel.findOne({ where: { id, companyId } });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  async create(companyId: string, dto: CreateOrderDto) {
    const product = await this.productModel.findOne({ where: { id: dto.productId, companyId } });
    if (!product) throw new NotFoundException("Product not found");

    if (await this.billingService.isSeatBlocked(dto.accountHolderId)) {
      throw new ForbiddenException("This Account Holder's seat is blocked pending payment");
    }
    if (await this.billingService.isSeatBlocked(product.stockOwnerId)) {
      throw new ForbiddenException("This Stock Owner's seat is blocked pending payment");
    }

    let threePlId: string | null = null;
    if (product.fulfillmentType === ProductFulfillmentType.STOCK) {
      threePlId = dto.threePlId ?? product.threePlId;
      if (!threePlId) {
        throw new BadRequestException("A 3PL must be assigned for STOCK fulfillment products");
      }
      if (await this.billingService.isSeatBlocked(threePlId)) {
        throw new ForbiddenException("This 3PL's seat is blocked pending payment");
      }
    }

    const accountHolderProfile = await this.accountHolderProfileModel.findByPk(dto.accountHolderId);
    if (!accountHolderProfile) {
      throw new BadRequestException("Account Holder profile not found");
    }
    const stockOwnerProfile = await this.stockOwnerProfileModel.findByPk(product.stockOwnerId);
    if (!stockOwnerProfile) {
      throw new BadRequestException("Stock Owner profile not found");
    }

    let threePlPriceChargedSnapshot: number | null = null;
    let threePlPayoutSnapshot: number | null = null;
    if (threePlId) {
      const threePlProfile = await this.threePlProfileModel.findByPk(threePlId);
      if (!threePlProfile) throw new BadRequestException("3PL profile not found");
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
      orderDate: dto.orderDate ?? new Date().toISOString().slice(0, 10),
      ebayOrderRef: dto.ebayOrderRef,
      trackingNumber: dto.trackingNumber ?? null,
      buyerDetails: dto.buyerDetails,
      ebayNetProceeds: dto.ebayNetProceeds,
      shippingCost: dto.shippingCost ?? 0,
      sellPriceSnapshot: product.sellPrice,
      buyPriceSnapshot: product.buyPrice,
      stockOwnerCostSnapshot: product.stockOwnerCost,
      threePlPriceChargedSnapshot,
      threePlPayoutSnapshot,
      accountHolderSharePercentSnapshot: accountHolderProfile.sharePercent,
      stockOwnerPayoutModeSnapshot: stockOwnerProfile.payoutMode,
      stockOwnerSharePercentSnapshot: stockOwnerProfile.sharePercent,
    });

    product.stockQuantity -= dto.quantity;
    await product.save();

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

    await order.save();
    return order;
  }

  async updateStatus(companyId: string, requester: JwtPayload, id: string, dto: UpdateOrderStatusDto) {
    const order = await this.get(companyId, id);
    this.assertStatusTransitionAllowed(order, requester, dto.status);

    order.status = dto.status;
    if (dto.status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    }

    if (TERMINAL_RESTOCK_STATUSES.includes(dto.status) && !order.restocked) {
      const product = await this.productModel.findByPk(order.productId);
      if (product) {
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
