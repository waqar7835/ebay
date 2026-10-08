import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op, Transaction, UniqueConstraintError } from "sequelize";
import { Currency, ExchangeRates, OrderStatus, ProductFulfillmentType, Role } from "@ebay-order-management/shared";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { Company } from "../database/models/company.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { User } from "../database/models/user.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { FinanceService } from "../finance/finance.service";
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { BulkUpdateOrderStatusDto } from "./dto/bulk-update-status.dto";
import { ThreePlFulfillmentDto } from "./dto/three-pl-fulfillment.dto";
import { OrderItemInputDto } from "./dto/order-item.dto";
import { daysInStatus, isOrderStale } from "./order-staleness.util";
import {
  adoptLegacyAmounts,
  cleanManualRates,
  convertOrderAmounts,
  orderCurrencies,
} from "./order-currency.util";

// A cancelled order's stock goes back on the shelf. A refunded one doesn't (decided 2026-10-08): once shipped, the
// product is the Account Holder's responsibility, and the Stock Owner is still paid for it.
const TERMINAL_RESTOCK_STATUSES = [OrderStatus.CANCELLED];
// 3PLs no longer see PENDING orders at all (a manager must make that first move), so they only
// ever self-advance PROCESSING -> SHIPPED.
const THREE_PL_ALLOWED_FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PROCESSING]: OrderStatus.SHIPPED,
};
const MANAGER_ROLES = [Role.ADMIN, Role.STAFF, Role.SUPER_ADMIN, Role.PLATFORM_STAFF];

interface OrderLine {
  product: Product;
  quantity: number;
  /** DROPSHIP only: the line's buy total in the 3PL's currency; undefined = not sent (keep on edit). */
  buyTotal?: number | null;
  /** DROPSHIP only: the line's client buying price in the Account Holder's currency; undefined = keep on edit. */
  clientTotal?: number | null;
}

export interface OrderListFilters {
  accountHolderId?: string;
  threePlId?: string;
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
  /** eBay order number (case-insensitive, partial). When set, every other filter is ignored. */
  orderRef?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order) private readonly orderModel: typeof Order,
    @InjectModel(OrderItem) private readonly orderItemModel: typeof OrderItem,
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerProfileModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlProfileModel: typeof ThreePlProfile,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(BackofficeStaffProfile) private readonly backofficeStaffProfileModel: typeof BackofficeStaffProfile,
    private readonly subscriptions: SubscriptionsService,
    private readonly financeService: FinanceService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async list(companyId: string, requester: JwtPayload, filters: OrderListFilters = {}) {
    // Searching by order number finds the order wherever it is: status, date and user filters are dropped (the
    // requester's own visibility scoping below still applies).
    const orderRef = filters.orderRef?.trim();
    if (orderRef) filters = { orderRef };
    const where: Record<string, unknown> = { companyId };
    const isManager = requester.roles.some((r) => MANAGER_ROLES.includes(r));

    const isThreePl = requester.roles.includes(Role.THREE_PL);
    if (!isManager) {
      if (requester.roles.includes(Role.ACCOUNT_HOLDER)) where.accountHolderId = requester.sub;
      else if (requester.roles.includes(Role.STOCK_OWNER)) where.id = await this.orderIdsForStockOwner(requester.sub);
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
    if (orderRef) where.ebayOrderRef = { [Op.iLike]: `%${orderRef.replace(/[\\%_]/g, "\\$&")}%` };

    const orders = await this.orderModel.findAll({ where, order: [["createdAt", "DESC"]] });
    const staleOrderDays = await this.staleOrderDays(companyId);
    const now = new Date();
    return orders.map((order) => this.withStaleness(order, staleOrderDays, now, isManager, requester));
  }

  /** Orders with at least one item from this Stock Owner. */
  private async orderIdsForStockOwner(stockOwnerId: string): Promise<string[]> {
    const items = await this.orderItemModel.findAll({ attributes: ["orderId"], where: { stockOwnerId } });
    return [...new Set(items.map((i) => i.orderId))];
  }

  /** Order comments are notes for the 3PL: only managers and 3PLs receive them. */
  private canSeeComments(isManager: boolean, requester: JwtPayload) {
    return isManager || requester.roles.includes(Role.THREE_PL);
  }

  /** GET /orders/:id — the order as this requester may see it. */
  async getForRequester(companyId: string, requester: JwtPayload, id: string) {
    const order = await this.get(companyId, id);
    const isManager = requester.roles.some((r) => MANAGER_ROLES.includes(r));
    const json = order.toJSON() as Order;
    return {
      ...json,
      items: this.visibleItems(json.items, isManager, requester),
      comments: this.canSeeComments(isManager, requester) ? json.comments : null,
    };
  }

  /**
   * Dropship prices are role-specific (decided 2026-10-08): the buy price is between the company and the 3PL, the
   * client buying price between the company and the Account Holder. Managers see both; a Stock Owner only sees their
   * own items (and never a dropship one).
   */
  private visibleItems(items: OrderItem[], isManager: boolean, requester: JwtPayload) {
    if (isManager) return items;
    const isStockOwnerOnly = requester.roles.includes(Role.STOCK_OWNER) && !requester.roles.includes(Role.ACCOUNT_HOLDER);
    const seesBuy = requester.roles.includes(Role.THREE_PL);
    const seesClient = requester.roles.includes(Role.ACCOUNT_HOLDER);
    return items
      .filter((i) => !isStockOwnerOnly || i.stockOwnerId === requester.sub)
      .map((i) => ({
        ...i,
        ...(seesBuy ? {} : { buyTotalSnapshot: null, buyTotalOriginal: null }),
        ...(seesClient ? {} : { clientTotalSnapshot: null, clientTotalOriginal: null }),
      }));
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

  private withStaleness(order: Order, staleOrderDays: number, now: Date, isManager: boolean, requester: JwtPayload) {
    const json = order.toJSON() as Order;
    return {
      ...json,
      // A Stock Owner only sees their own items on an order that mixes Stock Owners.
      items: this.visibleItems(json.items, isManager, requester),
      daysInStatus: daysInStatus(order.statusChangedAt, now),
      stale: isOrderStale(order.status, order.statusChangedAt, staleOrderDays, now),
      comments: this.canSeeComments(isManager, requester) ? json.comments : null,
      // Company profit is a manager-only figure — Account Holders/Stock Owners/3PLs only ever see their own payout.
      companyProfit: isManager ? this.financeService.companyProfit(order) : undefined,
    };
  }

  // eBay order numbers are unique per company (DB index orders_company_id_ebay_order_ref_unique);
  // this pre-check just gives a friendly error before hitting the constraint.
  private async assertEbayOrderRefAvailable(companyId: string, ebayOrderRef: string, excludeOrderId?: string) {
    const existing = await this.orderModel.findOne({
      where: { companyId, ebayOrderRef, ...(excludeOrderId ? { id: { [Op.ne]: excludeOrderId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(`eBay order number "${ebayOrderRef}" is already used by another order`);
    }
  }

  // Catches the race where two requests pass the pre-check at once and the DB index rejects the second.
  private async saveWithUniqueRef<T>(ebayOrderRef: string, save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConflictException(`eBay order number "${ebayOrderRef}" is already used by another order`);
      }
      throw err;
    }
  }

  async create(companyId: string, dto: CreateOrderDto) {
    const ebayOrderRef = dto.ebayOrderRef.trim();
    if (!ebayOrderRef) throw new BadRequestException("eBay order number is required");
    await this.assertEbayOrderRefAvailable(companyId, ebayOrderRef);

    const lines = await this.resolveLines(companyId, dto.items);
    const fulfillmentType = lines[0].product.fulfillmentType;

    if (await this.subscriptions.isUserDisabled(dto.accountHolderId)) {
      throw new ForbiddenException("This Account Holder's account is deactivated");
    }
    const accountHolderProfile = await this.accountHolderProfileModel.findByPk(dto.accountHolderId);
    if (!accountHolderProfile) {
      throw new BadRequestException("Account Holder profile not found");
    }

    const threePlId = this.resolveThreePlId(lines, dto.threePlId, null);
    const threePlSnapshot = await this.snapshotThreePl(threePlId, fulfillmentType, accountHolderProfile, null);
    const itemRows = await Promise.all(lines.map((line, position) => this.snapshotItem(line, position)));
    if (fulfillmentType === ProductFulfillmentType.DROPSHIP) {
      assertDropshipTotalsAllowed(lines, threePlId);
      itemRows.forEach((row, i) => {
        row.buyTotalOriginal = lines[i].buyTotal ?? null;
        row.clientTotalOriginal = lines[i].clientTotal ?? null;
      });
    }

    // Amounts are entered in each party's currency and converted to PKR with rates locked on the order.
    const amounts = {
      accountHolderCurrency: await this.currencyOf(dto.accountHolderId),
      ebayNetProceeds: 0,
      ebayNetProceedsOriginal: dto.ebayNetProceeds,
      shippingCost: 0,
      shippingCostOriginal: dto.shippingCost ?? 0,
      ...threePlSnapshot,
    };
    if (fulfillmentType === ProductFulfillmentType.DROPSHIP) syncDropshipPayout(amounts, itemRows);
    const rates = await this.exchangeRatesService.resolve(
      orderCurrencies(amounts, itemRows),
      cleanManualRates(dto.exchangeRates),
    );
    convertOrderAmounts(amounts, itemRows, rates);

    const sequelize = this.orderModel.sequelize!;
    const orderId = await this.saveWithUniqueRef(ebayOrderRef, () =>
      sequelize.transaction(async (transaction) => {
        const order = await this.orderModel.create(
          {
            companyId,
            accountHolderId: dto.accountHolderId,
            threePlId,
            status: OrderStatus.PENDING,
            statusChangedAt: new Date(),
            orderDate: dto.orderDate ?? new Date().toISOString().slice(0, 10),
            ebayOrderRef,
            trackingNumber: dto.trackingNumber ?? null,
            buyerDetails: dto.buyerDetails,
            supplierUrl: dto.supplierUrl ?? null,
            comments: dto.comments?.trim() || null,
            ...amounts,
            exchangeRates: rates,
            exchangeRatesAt: new Date(),
            accountHolderSharePercentSnapshot: accountHolderProfile.sharePercent,
          },
          { transaction },
        );
        await this.orderItemModel.bulkCreate(
          itemRows.map((row) => ({ ...row, orderId: order.id })),
          { transaction },
        );
        // DROPSHIP products hold no stock to decrement.
        for (const line of lines) await adjustStock(line.product, -line.quantity, transaction);
        return order.id;
      }),
    );

    return this.get(companyId, orderId);
  }

  async update(companyId: string, id: string, dto: UpdateOrderDto) {
    const order = await this.get(companyId, id);
    assertNotInvoiced(order);
    // An order from before currencies holds plain PKR amounts. Treat them as entered in each party's
    // current currency; finalizeAmounts() converts them with today's rates.
    const legacy = !order.exchangeRates;
    if (legacy) await this.adoptLegacy(order, []);

    // An order's type (all-Stock or all-Dropship) is fixed once it's created — see changeItems.
    const dropship = await this.isDropshipOrder(order);
    if (dto.orderDate !== undefined) order.orderDate = dto.orderDate;
    if (dto.accountHolderId !== undefined && dto.accountHolderId !== order.accountHolderId) {
      await this.changeAccountHolder(order, dto.accountHolderId, dropship);
    }
    if (dto.ebayOrderRef !== undefined) {
      const ebayOrderRef = dto.ebayOrderRef.trim();
      if (!ebayOrderRef) throw new BadRequestException("eBay order number is required");
      await this.assertEbayOrderRefAvailable(companyId, ebayOrderRef, order.id);
      order.ebayOrderRef = ebayOrderRef;
    }
    if (dto.trackingNumber !== undefined) order.trackingNumber = dto.trackingNumber;
    if (dto.buyerDetails !== undefined) order.buyerDetails = dto.buyerDetails;
    // Entered in the Account Holder's currency; converted to PKR in finalizeAmounts().
    if (dto.ebayNetProceeds !== undefined) order.ebayNetProceedsOriginal = dto.ebayNetProceeds;
    if (dto.shippingCost !== undefined) order.shippingCostOriginal = dto.shippingCost;
    if (dto.supplierUrl !== undefined) order.supplierUrl = dto.supplierUrl;
    if (dto.comments !== undefined) order.comments = dto.comments.trim() || null;

    const sequelize = this.orderModel.sequelize!;
    await this.saveWithUniqueRef(order.ebayOrderRef, () =>
      sequelize.transaction(async (transaction) => {
        if (dto.items !== undefined || (dto.threePlId !== undefined && dto.threePlId !== order.threePlId)) {
          await this.changeItems(companyId, order, dto.items, dto.threePlId, transaction);
        }
        await this.finalizeAmounts(order, legacy, dto, dropship, transaction);
        await order.save({ transaction });
      }),
    );
    return this.get(companyId, order.id);
  }

  /**
   * Converts the order's entered amounts to PKR after an edit. Rates aren't locked until the order is invoiced
   * (decided 2026-10-08): every save by Admin/Staff re-converts everything with today's rates (the admin's typed-in
   * rates win, e.g. when the rate API is down). Once the order is on any invoice it can't be edited (assertNotInvoiced),
   * so the rates it had then stay frozen until that invoice is deleted or voided. A pre-currency order saved here has
   * its plain-PKR amounts read as each party's current currency and converted too.
   */
  private async finalizeAmounts(order: Order, legacy: boolean, dto: UpdateOrderDto, dropship: boolean, transaction: Transaction) {
    const items = await this.orderItemModel.findAll({ where: { orderId: order.id }, transaction });
    // Items kept from before currencies (new ones already carry their currency).
    if (legacy) await this.adoptLegacy(order, items);
    if (dropship) syncDropshipPayout(order, items);
    const currencies = orderCurrencies(order, items);
    const rates = await this.exchangeRatesService.resolve(currencies, cleanManualRates(dto.exchangeRates));
    convertOrderAmounts(order, items, rates);
    order.exchangeRates = Object.fromEntries([...currencies].map((c) => [c, rates[c]]));
    order.exchangeRatesAt = new Date();
    for (const item of items) if (item.changed()) await item.save({ transaction });
  }

  private async adoptLegacy(order: Order, items: OrderItem[]) {
    const stockOwnerIds = items.map((i) => i.stockOwnerId).filter((id): id is string => !!id);
    const users = await this.userModel.findAll({
      attributes: ["id", "currency"],
      where: { id: [order.accountHolderId, ...(order.threePlId ? [order.threePlId] : []), ...stockOwnerIds] },
    });
    const currencyById = new Map(users.map((u) => [u.id, u.currency]));
    adoptLegacyAmounts(order, items, (party) => {
      if (party === "accountHolder") return currencyById.get(order.accountHolderId) ?? null;
      if (party === "threePl") return order.threePlId ? (currencyById.get(order.threePlId) ?? null) : null;
      return currencyById.get(party.stockOwnerId) ?? null;
    });
  }

  private async isDropshipOrder(order: Order): Promise<boolean> {
    const first = order.items?.[0];
    const product = first ? await this.productModel.findByPk(first.productId, { attributes: ["id", "fulfillmentType"] }) : null;
    return product?.fulfillmentType === ProductFulfillmentType.DROPSHIP;
  }

  private async currencyOf(userId: string): Promise<Currency> {
    const user = await this.userModel.findByPk(userId, { attributes: ["id", "currency"] });
    if (!user) throw new BadRequestException("User not found");
    return user.currency;
  }

  /**
   * Like changeItems: swapping the Account Holder re-snapshots their share % and the 3PL price
   * they're charged from the new holder's current profile, at any status. Issued invoices aren't adjusted.
   */
  private async changeAccountHolder(order: Order, accountHolderId: string, dropship: boolean) {
    if (await this.subscriptions.isUserDisabled(accountHolderId)) {
      throw new ForbiddenException("This Account Holder's account is deactivated");
    }
    const profile = await this.accountHolderProfileModel.findByPk(accountHolderId);
    if (!profile) throw new BadRequestException("Account Holder profile not found");

    order.accountHolderId = accountHolderId;
    order.accountHolderSharePercentSnapshot = profile.sharePercent;
    // The order's Account Holder amounts (eBay proceeds, shipping, 3PL price) are now in the new holder's currency.
    order.accountHolderCurrency = await this.currencyOf(accountHolderId);
    // Dropship orders carry no 3PL service charge.
    if (order.threePlId) order.threePlPriceChargedOriginal = dropship ? 0 : (profile.threePlPriceCharged ?? 0);
  }

  /**
   * Replaces the order's items. A product that stays on the order keeps its snapshot (only its
   * quantity changes); a newly added product deliberately snapshots prices, Stock Owner + share terms
   * from its *current* rates. Stock moves by the difference per product. The 3PL fee (charged once
   * per order) is re-snapshotted only when the order's 3PL changes. Allowed at any status — invoices
   * already issued for this order are not rewritten, so they may no longer match it.
   */
  private async changeItems(
    companyId: string,
    order: Order,
    inputs: OrderItemInputDto[] | undefined,
    threePlIdOverride: string | null | undefined,
    transaction: Transaction,
  ) {
    const existing = order.items ?? [];
    const alreadyOnOrder = new Set(existing.map((i) => i.productId));
    const lines = await this.resolveLines(
      companyId,
      inputs ?? existing.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      alreadyOnOrder,
    );
    const fulfillmentType = lines[0].product.fulfillmentType;

    const oldProducts = await this.productModel.findAll({ where: { id: existing.map((i) => i.productId) } });
    const oldProductById = new Map(oldProducts.map((p) => [p.id, p]));
    const wasDropship = existing.some((i) => oldProductById.get(i.productId)?.fulfillmentType === ProductFulfillmentType.DROPSHIP);
    if (existing.length && wasDropship !== (fulfillmentType === ProductFulfillmentType.DROPSHIP)) {
      throw new BadRequestException("An order can't be switched between Stock and Dropship products once it's created");
    }

    // Keep an already-assigned dropship 3PL when staying on DROPSHIP.
    const threePlId = this.resolveThreePlId(lines, threePlIdOverride, wasDropship ? order.threePlId : null);
    if (threePlId !== order.threePlId) {
      const accountHolderProfile = await this.accountHolderProfileModel.findByPk(order.accountHolderId);
      Object.assign(order, await this.snapshotThreePl(threePlId, fulfillmentType, accountHolderProfile, order.threePlId));
      order.threePlId = threePlId;
    } else if (threePlId) {
      await this.assertThreePlHandles(threePlId, fulfillmentType);
    }
    if (wasDropship) assertDropshipTotalsAllowed(lines, threePlId);
    // A pre-currency order's amounts are plain PKR in the *Snapshot fields (adoptLegacy reads them from
    // there), so a dropship total typed in on one is written to both.
    const setBuyTotal = (item: { buyTotalOriginal: number | null; buyTotalSnapshot: number | null }, total: number | null) => {
      item.buyTotalOriginal = total;
      if (!order.exchangeRates) item.buyTotalSnapshot = total;
    };
    const setClientTotal = (item: { clientTotalOriginal: number | null; clientTotalSnapshot: number | null }, total: number | null) => {
      item.clientTotalOriginal = total;
      if (!order.exchangeRates) item.clientTotalSnapshot = total;
    };

    const existingByProduct = new Map(existing.map((i) => [i.productId, i]));
    const keptIds = new Set<string>();
    for (const [position, line] of lines.entries()) {
      const current = existingByProduct.get(line.product.id);
      // Orders already restocked (cancelled/returned) hold no stock, so there's nothing to move.
      const stockDelta = line.quantity - (current?.quantity ?? 0);
      if (!order.restocked) await adjustStock(line.product, -stockDelta, transaction);
      if (current) {
        keptIds.add(current.id);
        current.quantity = line.quantity;
        current.position = position;
        if (wasDropship && line.buyTotal !== undefined) setBuyTotal(current, line.buyTotal);
        if (wasDropship && line.clientTotal !== undefined) setClientTotal(current, line.clientTotal);
        await current.save({ transaction });
      } else {
        const row = await this.snapshotItem(line, position);
        if (wasDropship) {
          setBuyTotal(row, line.buyTotal ?? null);
          setClientTotal(row, line.clientTotal ?? null);
        }
        await this.orderItemModel.create({ ...row, orderId: order.id }, { transaction });
      }
    }
    for (const item of existing) {
      if (keptIds.has(item.id)) continue;
      const product = oldProductById.get(item.productId);
      if (product && !order.restocked) await adjustStock(product, item.quantity, transaction);
      await item.destroy({ transaction });
    }
  }

  /**
   * Loads and validates an order's products. Repeated products are merged. An order is all-STOCK or
   * all-DROPSHIP; only DROPSHIP lines take a buy total. The Stock Owner of every
   * product being added (i.e. not in `alreadyOnOrder`) must not be deactivated.
   */
  private async resolveLines(
    companyId: string,
    inputs: OrderItemInputDto[],
    alreadyOnOrder: Set<string> = new Set(),
  ): Promise<OrderLine[]> {
    if (!inputs.length) throw new BadRequestException("An order needs at least one product");
    const merged = new Map<string, { quantity: number; buyTotal?: number | null; clientTotal?: number | null }>();
    for (const input of inputs) {
      const prev = merged.get(input.productId);
      if (!prev) {
        merged.set(input.productId, { quantity: input.quantity, buyTotal: input.buyTotal, clientTotal: input.clientTotal });
        continue;
      }
      prev.quantity += input.quantity;
      if (input.buyTotal != null) prev.buyTotal = round2((prev.buyTotal ?? 0) + input.buyTotal);
      if (input.clientTotal != null) prev.clientTotal = round2((prev.clientTotal ?? 0) + input.clientTotal);
    }

    const products = await this.productModel.findAll({ where: { id: [...merged.keys()], companyId } });
    const productById = new Map(products.map((p) => [p.id, p]));
    const lines = [...merged.entries()].map(([productId, { quantity, buyTotal, clientTotal }]) => {
      const product = productById.get(productId);
      if (!product) throw new NotFoundException("Product not found");
      return { product, quantity, buyTotal, clientTotal };
    });

    if (new Set(lines.map((l) => l.product.fulfillmentType)).size > 1) {
      throw new BadRequestException("An order can't mix Stock and Dropship products");
    }
    if (lines.some((l) => l.product.fulfillmentType === ProductFulfillmentType.STOCK && (l.buyTotal != null || l.clientTotal != null))) {
      throw new BadRequestException("Only dropship products take a buy price or client buying price on the order");
    }
    const addedStockOwners = lines.filter((l) => !alreadyOnOrder.has(l.product.id)).map((l) => l.product.stockOwnerId);
    for (const stockOwnerId of new Set(addedStockOwners.filter((id): id is string => !!id))) {
      if (await this.subscriptions.isUserDisabled(stockOwnerId)) {
        throw new ForbiddenException("The Stock Owner of one of these products is deactivated");
      }
    }
    return lines;
  }

  /**
   * STOCK orders ship from one 3PL (its fee is charged once per order), so every product must be held
   * at the same 3PL; the caller may override which 3PL. DROPSHIP orders take the override (null = no 3PL)
   * or, when it's undefined, `keepExisting`.
   */
  private resolveThreePlId(lines: OrderLine[], override: string | null | undefined, keepExisting: string | null): string | null {
    if (lines[0].product.fulfillmentType === ProductFulfillmentType.DROPSHIP) return override !== undefined ? override : keepExisting;

    const warehouses = new Set(lines.map((l) => l.product.threePlId).filter((id): id is string => !!id));
    if (warehouses.size > 1) {
      throw new BadRequestException("These products are held at different 3PLs — an order can only ship from one 3PL");
    }
    const threePlId = override ?? [...warehouses][0];
    if (!threePlId) throw new BadRequestException("A 3PL must be assigned for STOCK fulfillment products");
    return threePlId;
  }

  private async assertThreePlHandles(threePlId: string, fulfillmentType: ProductFulfillmentType) {
    const threePlProfile = await this.threePlProfileModel.findByPk(threePlId);
    if (!threePlProfile) throw new BadRequestException("3PL profile not found");
    if (threePlProfile.fulfillmentType !== fulfillmentType) {
      throw new BadRequestException(
        `The selected 3PL handles ${threePlProfile.fulfillmentType} fulfillment, but these products are ${fulfillmentType}`,
      );
    }
    return threePlProfile;
  }

  /**
   * The once-per-order 3PL fee: what the Account Holder is charged and what the 3PL is paid. DROPSHIP: no charge,
   * and the payout is replaced by the sum of the buy prices (syncDropshipPayout).
   */
  private async snapshotThreePl(
    threePlId: string | null,
    fulfillmentType: ProductFulfillmentType,
    accountHolderProfile: AccountHolderProfile | null,
    previousThreePlId: string | null,
  ) {
    const none = { threePlCurrency: null, threePlPriceChargedOriginal: null, threePlPayoutOriginal: null };
    if (!threePlId) return { ...none, threePlPriceChargedSnapshot: null, threePlPayoutSnapshot: null };
    if (threePlId !== previousThreePlId && (await this.subscriptions.isUserDisabled(threePlId))) {
      throw new ForbiddenException("This 3PL's account is deactivated");
    }
    const threePlProfile = await this.assertThreePlHandles(threePlId, fulfillmentType);
    // Originals only (Account Holder's / 3PL's currency) — the PKR snapshots are derived by convertOrderAmounts().
    return {
      threePlCurrency: await this.currencyOf(threePlId),
      // Dropship orders carry no 3PL service charge (the 3PL is only reimbursed the buy prices).
      threePlPriceChargedOriginal:
        fulfillmentType === ProductFulfillmentType.DROPSHIP ? 0 : (accountHolderProfile?.threePlPriceCharged ?? 0),
      threePlPayoutOriginal: threePlProfile.payoutPerOrder,
      threePlPriceChargedSnapshot: null as number | null,
      threePlPayoutSnapshot: null as number | null,
    };
  }

  /**
   * Per-item snapshot of the product's current prices and its Stock Owner's share terms.
   * DROPSHIP: no product-level price — the line's buy total is entered on the order by the admin
   * and/or the assigned 3PL (see setDropshipBuyPrice below).
   */
  private async snapshotItem(line: OrderLine, position: number) {
    const { product, quantity } = line;
    const stockOwnerProfile = product.stockOwnerId ? await this.stockOwnerProfileModel.findByPk(product.stockOwnerId) : null;
    if (product.stockOwnerId && !stockOwnerProfile) {
      throw new BadRequestException("Stock Owner profile not found");
    }
    return {
      productId: product.id,
      stockOwnerId: product.stockOwnerId,
      position,
      quantity,
      // Product prices are in the Stock Owner's currency; the PKR snapshots are derived by convertOrderAmounts().
      currency: product.stockOwnerId ? await this.currencyOf(product.stockOwnerId) : null,
      sellPriceOriginal: product.sellPrice,
      buyPriceOriginal: product.buyPrice,
      stockOwnerCostOriginal: product.stockOwnerCost,
      sellPriceSnapshot: null as number | null,
      buyPriceSnapshot: null as number | null,
      stockOwnerCostSnapshot: null as number | null,
      stockOwnerPayoutModeSnapshot: stockOwnerProfile?.payoutMode ?? null,
      stockOwnerSharePercentSnapshot: stockOwnerProfile?.sharePercent ?? null,
      buyTotalOriginal: null as number | null,
      buyTotalSnapshot: null as number | null,
      clientTotalOriginal: null as number | null,
      clientTotalSnapshot: null as number | null,
    };
  }

  /**
   * Lets the assigned 3PL enter or correct the buy total of one line on a DROPSHIP order once they can
   * see it (status past PENDING), until it's invoiced. Their payout is the sum of the lines.
   */
  async setDropshipBuyPrice(companyId: string, requester: JwtPayload, id: string, itemId: string, buyTotal: number) {
    const order = await this.get(companyId, id);
    this.assertAssignedThreePl(order, requester);
    await this.applyDropshipBuyTotals(order, requester, [{ itemId, buyTotal }]);
    for (const i of order.items) if (i.changed()) await i.save();
    await order.save();
    return this.getForRequester(companyId, requester, id);
  }

  /**
   * A DROPSHIP 3PL's Edit popup on the orders list: line buy totals (until the order is invoiced), the supplier URL,
   * the tracking number and PROCESSING -> SHIPPED. Only while the order is PROCESSING or SHIPPED; all in one save.
   */
  async updateThreePlFulfillment(companyId: string, requester: JwtPayload, id: string, dto: ThreePlFulfillmentDto) {
    const order = await this.get(companyId, id);
    this.assertAssignedThreePl(order, requester);
    if (order.status !== OrderStatus.PROCESSING && order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException("Only PROCESSING or SHIPPED orders can be edited");
    }
    if (!(await this.isDropshipOrder(order))) {
      throw new BadRequestException("Only DROPSHIP orders can be edited by their 3PL");
    }

    await this.orderModel.sequelize!.transaction(async (transaction) => {
      if (dto.buyTotals?.length) await this.applyDropshipBuyTotals(order, requester, dto.buyTotals);
      if (dto.supplierUrl !== undefined) order.supplierUrl = dto.supplierUrl.trim() || null;
      if (dto.trackingNumber !== undefined) order.trackingNumber = dto.trackingNumber.trim() || null;
      for (const i of order.items) if (i.changed()) await i.save({ transaction });
      if (dto.markShipped && order.status === OrderStatus.PROCESSING) {
        this.assertStatusTransitionAllowed(order, requester, OrderStatus.SHIPPED);
        await this.applyStatus(order, OrderStatus.SHIPPED, transaction);
      } else {
        await order.save({ transaction });
      }
    });
    return this.getForRequester(companyId, requester, id);
  }

  private assertAssignedThreePl(order: Order, requester: JwtPayload) {
    if (order.threePlId !== requester.sub) {
      throw new ForbiddenException("This order is not assigned to you");
    }
    if (order.status === OrderStatus.PENDING) {
      throw new ForbiddenException("This order is not visible to 3PL users yet");
    }
  }

  /** Sets dropship line buy totals entered by the order's 3PL (in their currency) and re-syncs the payout. No save. */
  private async applyDropshipBuyTotals(order: Order, requester: JwtPayload, totals: { itemId: string; buyTotal: number }[]) {
    assertNotInvoiced(order);
    if (!(await this.isDropshipOrder(order))) {
      throw new BadRequestException("Buy price can only be entered for DROPSHIP orders");
    }
    const items = totals.map(({ itemId, buyTotal }) => {
      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException("Order item not found");
      return { item, buyTotal };
    });

    if (!order.exchangeRates) {
      // Pre-currency order: amounts stay plain PKR.
      for (const { item, buyTotal } of items) item.buyTotalSnapshot = buyTotal;
      order.threePlPayoutSnapshot = sumBuyTotals(order.items.map((i) => i.buyTotalSnapshot));
    } else {
      // Entered in the 3PL's own currency, converted with the order's locked rate for it.
      order.threePlCurrency = order.threePlCurrency ?? (await this.currencyOf(requester.sub));
      for (const { item, buyTotal } of items) item.buyTotalOriginal = buyTotal;
      syncDropshipPayout(order, order.items);
      if (!order.exchangeRates[order.threePlCurrency]) {
        order.exchangeRates = { ...order.exchangeRates, ...(await this.exchangeRatesService.resolve([order.threePlCurrency])) };
      }
      convertOrderAmounts(order, order.items, order.exchangeRates);
    }
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
    if (dto.refundAmount !== undefined && dto.status !== OrderStatus.REFUNDED) {
      throw new BadRequestException("A refund amount only goes with the REFUNDED status");
    }
    await this.applyStatus(order, dto.status, undefined, dto.refundAmount);
    return this.getForRequester(companyId, requester, id);
  }

  /**
   * Sets one status on many orders at once, all-or-nothing: any missing order or disallowed move rolls the whole
   * change back. Orders already in that status are left untouched. Managers need canManageOrders; a 3PL may use it
   * too, limited per order by assertStatusTransitionAllowed (its own orders, PROCESSING -> SHIPPED only).
   */
  async bulkUpdateStatus(companyId: string, requester: JwtPayload, dto: BulkUpdateOrderStatusDto) {
    await this.assertCanBulkUpdateStatus(requester);
    const ids = [...new Set(dto.orderIds)];
    return this.orderModel.sequelize!.transaction(async (transaction) => {
      const orders = await this.orderModel.findAll({ where: { id: ids, companyId }, transaction });
      if (orders.length !== ids.length) {
        throw new NotFoundException("Some of the selected orders no longer exist — refresh and try again");
      }
      let updated = 0;
      for (const order of orders) {
        if (order.status === dto.status) continue;
        this.assertStatusTransitionAllowed(order, requester, dto.status);
        await this.applyStatus(order, dto.status, transaction);
        updated++;
      }
      return { updated, unchanged: orders.length - updated };
    });
  }

  private async assertCanBulkUpdateStatus(requester: JwtPayload) {
    if (requester.roles.includes(Role.SUPER_ADMIN)) return;
    if (requester.realm === "backoffice") {
      const profile = await this.backofficeStaffProfileModel.findByPk(requester.sub);
      if (requester.roles.includes(Role.PLATFORM_STAFF) && profile?.canManageOrders) return;
    } else {
      if (requester.roles.includes(Role.ADMIN) || requester.roles.includes(Role.THREE_PL)) return;
      const profile = requester.roles.includes(Role.STAFF) ? await this.staffProfileModel.findByPk(requester.sub) : null;
      if (profile?.canManageOrders) return;
    }
    throw new ForbiddenException("You do not have permission to perform this action");
  }

  /** `refundAmount` (REFUNDED only): a partial refund in the Account Holder's currency; omitted = the full payout. */
  private async applyStatus(order: Order, status: OrderStatus, transaction?: Transaction, refundAmount?: number) {
    await this.assertCanShip(order, status);
    if (order.status === OrderStatus.REFUNDED && status !== OrderStatus.REFUNDED) this.clearRefund(order);
    if (status === OrderStatus.REFUNDED && order.status !== OrderStatus.REFUNDED) {
      await this.recordRefund(order, refundAmount);
    }
    order.status = status;
    order.statusChangedAt = new Date();
    if (status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    }

    if (TERMINAL_RESTOCK_STATUSES.includes(status) && !order.restocked) {
      for (const item of order.items) {
        const product = await this.productModel.findByPk(item.productId, { transaction });
        if (product) await adjustStock(product, item.quantity, transaction);
      }
      order.restocked = true;
    }

    await order.save({ transaction });
  }

  /**
   * Stores how much of the eBay payout was refunded (decided 2026-10-08): the full payout unless a partial amount is
   * given, in the Account Holder's currency like the payout itself (plain PKR on orders from before currencies).
   * Dropship orders are always refunded in full.
   */
  private async recordRefund(order: Order, refundAmount?: number) {
    const payout = order.ebayNetProceedsOriginal ?? order.ebayNetProceeds;
    if (refundAmount !== undefined) {
      if (await this.isDropshipOrder(order)) {
        throw new BadRequestException(`Order ${order.ebayOrderRef}: dropship orders are always refunded in full`);
      }
      if (refundAmount > payout) {
        throw new BadRequestException(`Order ${order.ebayOrderRef}: the refund can't be more than the eBay payout (${payout})`);
      }
    }
    const amount = round2(refundAmount ?? payout);
    const rate = order.accountHolderCurrency ? order.exchangeRates?.[order.accountHolderCurrency] : undefined;
    order.refundAmountOriginal = order.ebayNetProceedsOriginal != null ? amount : null;
    order.refundAmount = rate && order.ebayNetProceedsOriginal != null ? round2(amount * rate) : amount;
  }

  /** Taking an order out of REFUNDED drops its refund — unless a refund adjustment for it is already on an invoice. */
  private clearRefund(order: Order) {
    if (order.accountHolderRefundInvoiceId || order.threePlRefundInvoiceId || order.items.some((i) => i.stockOwnerRefundInvoiceId)) {
      throw new BadRequestException(
        `Order ${order.ebayOrderRef}: its refund is already on an invoice — delete that invoice before changing the status`,
      );
    }
    order.refundAmount = null;
    order.refundAmountOriginal = null;
  }

  /**
   * A DROPSHIP order can't be marked SHIPPED (or DELIVERED) until every line has its buy price — for everyone,
   * Admin/Staff included (decided 2026-10-08): the 3PL's payout is those prices.
   */
  private async assertCanShip(order: Order, status: OrderStatus) {
    if (status !== OrderStatus.SHIPPED && status !== OrderStatus.DELIVERED) return;
    if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) return;
    if (!(await this.isDropshipOrder(order))) return;
    if (order.items.some((i) => i.buyTotalSnapshot == null)) {
      throw new BadRequestException(`Order ${order.ebayOrderRef}: enter the buy price of every product before marking it shipped`);
    }
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

/**
 * An order on any invoice (Account Holder, Stock Owner or 3PL) is locked: the invoice was drawn from
 * its figures. To change it, delete (or void) the invoice first. Status changes stay allowed.
 */
function assertNotInvoiced(order: Order) {
  if (order.accountHolderInvoiceId || order.threePlInvoiceId || order.items.some((i) => i.stockOwnerInvoiceId)) {
    throw new BadRequestException("This order is on an invoice and can't be edited — delete that invoice first");
  }
}

/** Moves a STOCK product's on-hand quantity by `delta` (negative = taken by an order). DROPSHIP holds no stock. */
async function adjustStock(product: Product, delta: number, transaction?: Transaction) {
  if (delta === 0 || product.fulfillmentType !== ProductFulfillmentType.STOCK) return;
  product.stockQuantity += delta;
  await product.save({ transaction });
}

/** A dropship line's buy total is in the 3PL's currency, so it can only be entered once a 3PL is picked. */
function assertDropshipTotalsAllowed(lines: OrderLine[], threePlId: string | null) {
  if (!threePlId && lines.some((l) => l.buyTotal != null)) {
    throw new BadRequestException("Pick a 3PL before entering dropship buy prices — they're in the 3PL's currency");
  }
}

/**
 * DROPSHIP: every line's buy total is in the order's 3PL's currency, and the 3PL's payout is their sum
 * (not the per-order fee) once every line has one. Works on the as-entered (*Original) amounts; the
 * caller converts to PKR. Without a 3PL there's no currency, so totals are cleared.
 */
function syncDropshipPayout(
  order: { threePlCurrency: Currency | null; threePlPayoutOriginal: number | null },
  items: { currency: Currency | null; buyTotalOriginal: number | null; buyTotalSnapshot: number | null }[],
) {
  for (const item of items) {
    item.currency = order.threePlCurrency;
    if (!order.threePlCurrency) {
      item.buyTotalOriginal = null;
      item.buyTotalSnapshot = null;
    }
  }
  order.threePlPayoutOriginal = order.threePlCurrency ? sumBuyTotals(items.map((i) => i.buyTotalOriginal)) : null;
}

/** Null while any line still lacks a buy total. */
function sumBuyTotals(totals: (number | null)[]): number | null {
  if (!totals.length || totals.some((t) => t == null)) return null;
  return round2(totals.reduce<number>((sum, t) => sum + t!, 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
