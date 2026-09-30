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
import { BillingService } from "../billing/billing.service";
import { FinanceService } from "../finance/finance.service";
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { OrderItemInputDto } from "./dto/order-item.dto";
import { daysInStatus, isOrderStale } from "./order-staleness.util";
import {
  adoptLegacyAmounts,
  cleanManualRates,
  convertOrderAmounts,
  keepLegacyAmounts,
  orderCurrencies,
} from "./order-currency.util";

const TERMINAL_RESTOCK_STATUSES = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];
// 3PLs no longer see PENDING orders at all (a manager must make that first move), so they only
// ever self-advance PROCESSING -> SHIPPED.
const THREE_PL_ALLOWED_FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PROCESSING]: OrderStatus.SHIPPED,
};
const MANAGER_ROLES = [Role.ADMIN, Role.STAFF, Role.SUPER_ADMIN, Role.PLATFORM_STAFF];

interface OrderLine {
  product: Product;
  quantity: number;
}

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
    @InjectModel(OrderItem) private readonly orderItemModel: typeof OrderItem,
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Product) private readonly productModel: typeof Product,
    @InjectModel(AccountHolderProfile) private readonly accountHolderProfileModel: typeof AccountHolderProfile,
    @InjectModel(StockOwnerProfile) private readonly stockOwnerProfileModel: typeof StockOwnerProfile,
    @InjectModel(ThreePlProfile) private readonly threePlProfileModel: typeof ThreePlProfile,
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly billingService: BillingService,
    private readonly financeService: FinanceService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async list(companyId: string, requester: JwtPayload, filters: OrderListFilters = {}) {
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
    // A Stock Owner only sees their own items on an order that mixes Stock Owners.
    const isStockOwnerOnly = !isManager && requester.roles.includes(Role.STOCK_OWNER) && !requester.roles.includes(Role.ACCOUNT_HOLDER);
    return {
      ...json,
      items: isStockOwnerOnly ? json.items.filter((i) => i.stockOwnerId === requester.sub) : json.items,
      daysInStatus: daysInStatus(order.statusChangedAt, now),
      stale: isOrderStale(order.status, order.statusChangedAt, staleOrderDays, now),
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

    if (await this.billingService.isSeatBlocked(dto.accountHolderId)) {
      throw new ForbiddenException("This Account Holder's seat is blocked pending payment");
    }
    const accountHolderProfile = await this.accountHolderProfileModel.findByPk(dto.accountHolderId);
    if (!accountHolderProfile) {
      throw new BadRequestException("Account Holder profile not found");
    }

    const threePlId = this.resolveThreePlId(lines, dto.threePlId, null);
    const threePlSnapshot = await this.snapshotThreePl(threePlId, fulfillmentType, accountHolderProfile, null);
    const itemRows = await Promise.all(lines.map((line, position) => this.snapshotItem(line, position)));

    // Amounts are entered in each party's currency and converted to PKR with rates locked on the order.
    const amounts = {
      accountHolderCurrency: await this.currencyOf(dto.accountHolderId),
      ebayNetProceeds: 0,
      ebayNetProceedsOriginal: dto.ebayNetProceeds,
      shippingCost: 0,
      shippingCostOriginal: dto.shippingCost ?? 0,
      ...threePlSnapshot,
    };
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
    // current currency while editing; finalizeAmounts() either converts them (recalculate) or puts them back.
    const legacy = !order.exchangeRates;
    if (legacy) await this.adoptLegacy(order, []);

    if (dto.orderDate !== undefined) order.orderDate = dto.orderDate;
    if (dto.accountHolderId !== undefined && dto.accountHolderId !== order.accountHolderId) {
      await this.changeAccountHolder(order, dto.accountHolderId);
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

    const sequelize = this.orderModel.sequelize!;
    await this.saveWithUniqueRef(order.ebayOrderRef, () =>
      sequelize.transaction(async (transaction) => {
        if (dto.items !== undefined || (dto.threePlId !== undefined && dto.threePlId !== order.threePlId)) {
          await this.changeItems(companyId, order, dto.items, dto.threePlId, transaction);
        }
        await this.finalizeAmounts(order, legacy, dto, transaction);
        await order.save({ transaction });
      }),
    );
    return this.get(companyId, order.id);
  }

  /**
   * Converts the order's entered amounts to PKR after an edit. By default the order keeps the rates
   * locked on it — only a currency that's new to the order (e.g. a new Account Holder in AUD) gets
   * today's rate. With `recalculateRates` every rate is refreshed (the admin's typed-in rates win).
   * A pre-currency order edited without recalculating stays as it was: plain PKR, no rates.
   */
  private async finalizeAmounts(order: Order, legacy: boolean, dto: UpdateOrderDto, transaction: Transaction) {
    const items = await this.orderItemModel.findAll({ where: { orderId: order.id }, transaction });
    // Items kept from before currencies (new ones already carry their currency).
    if (legacy) await this.adoptLegacy(order, items);
    if (legacy && !dto.recalculateRates) {
      keepLegacyAmounts(order, items);
    } else {
      const manual = cleanManualRates(dto.exchangeRates);
      const currencies = orderCurrencies(order, items);
      let rates: ExchangeRates;
      if (legacy || dto.recalculateRates) {
        rates = await this.exchangeRatesService.resolve(currencies, manual);
        order.exchangeRatesAt = new Date();
      } else {
        const locked = order.exchangeRates ?? {};
        const missing = [...currencies].filter((c) => !locked[c]);
        rates = { ...locked, ...(await this.exchangeRatesService.resolve(missing, manual)) };
      }
      convertOrderAmounts(order, items, rates);
      order.exchangeRates = Object.fromEntries([...currencies].map((c) => [c, rates[c]]));
    }
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

  private async currencyOf(userId: string): Promise<Currency> {
    const user = await this.userModel.findByPk(userId, { attributes: ["id", "currency"] });
    if (!user) throw new BadRequestException("User not found");
    return user.currency;
  }

  /**
   * Like changeItems: swapping the Account Holder re-snapshots their share % and the 3PL price
   * they're charged from the new holder's current profile, at any status. Issued invoices aren't adjusted.
   */
  private async changeAccountHolder(order: Order, accountHolderId: string) {
    if (await this.billingService.isSeatBlocked(accountHolderId)) {
      throw new ForbiddenException("This Account Holder's seat is blocked pending payment");
    }
    const profile = await this.accountHolderProfileModel.findByPk(accountHolderId);
    if (!profile) throw new BadRequestException("Account Holder profile not found");

    order.accountHolderId = accountHolderId;
    order.accountHolderSharePercentSnapshot = profile.sharePercent;
    // The order's Account Holder amounts (eBay proceeds, shipping, 3PL price) are now in the new holder's currency.
    order.accountHolderCurrency = await this.currencyOf(accountHolderId);
    if (order.threePlId) order.threePlPriceChargedOriginal = profile.threePlPriceCharged ?? 0;
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
    threePlIdOverride: string | undefined,
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

    // Keep an already-assigned dropship 3PL when staying on DROPSHIP.
    const threePlId = this.resolveThreePlId(lines, threePlIdOverride, wasDropship ? order.threePlId : null);
    if (threePlId !== order.threePlId) {
      const accountHolderProfile = await this.accountHolderProfileModel.findByPk(order.accountHolderId);
      Object.assign(order, await this.snapshotThreePl(threePlId, fulfillmentType, accountHolderProfile, order.threePlId));
      order.threePlId = threePlId;
    } else if (threePlId) {
      await this.assertThreePlHandles(threePlId, fulfillmentType);
    }

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
        await current.save({ transaction });
      } else {
        await this.orderItemModel.create({ ...(await this.snapshotItem(line, position)), orderId: order.id }, { transaction });
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
   * Loads and validates an order's products. Repeated products are merged. Several products are only
   * allowed when they're all STOCK; a DROPSHIP order has exactly one product. The Stock Owner of every
   * product being added (i.e. not in `alreadyOnOrder`) must have an active seat.
   */
  private async resolveLines(
    companyId: string,
    inputs: OrderItemInputDto[],
    alreadyOnOrder: Set<string> = new Set(),
  ): Promise<OrderLine[]> {
    if (!inputs.length) throw new BadRequestException("An order needs at least one product");
    const quantities = new Map<string, number>();
    for (const input of inputs) quantities.set(input.productId, (quantities.get(input.productId) ?? 0) + input.quantity);

    const products = await this.productModel.findAll({ where: { id: [...quantities.keys()], companyId } });
    const productById = new Map(products.map((p) => [p.id, p]));
    const lines = [...quantities.entries()].map(([productId, quantity]) => {
      const product = productById.get(productId);
      if (!product) throw new NotFoundException("Product not found");
      return { product, quantity };
    });

    if (lines.length > 1 && lines.some((l) => l.product.fulfillmentType === ProductFulfillmentType.DROPSHIP)) {
      throw new BadRequestException("Only Stock products can be combined in one order — a dropship order has a single product");
    }
    const addedStockOwners = lines.filter((l) => !alreadyOnOrder.has(l.product.id)).map((l) => l.product.stockOwnerId);
    for (const stockOwnerId of new Set(addedStockOwners.filter((id): id is string => !!id))) {
      if (await this.billingService.isSeatBlocked(stockOwnerId)) {
        throw new ForbiddenException("A Stock Owner of one of these products has a seat blocked pending payment");
      }
    }
    return lines;
  }

  /**
   * STOCK orders ship from one 3PL (its fee is charged once per order), so every product must be held
   * at the same 3PL; the caller may override which 3PL. DROPSHIP orders take the override or `keepExisting`.
   */
  private resolveThreePlId(lines: OrderLine[], override: string | undefined, keepExisting: string | null): string | null {
    if (lines[0].product.fulfillmentType === ProductFulfillmentType.DROPSHIP) return override ?? keepExisting;

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

  /** The once-per-order 3PL fee: what the Account Holder is charged and what the 3PL is paid. */
  private async snapshotThreePl(
    threePlId: string | null,
    fulfillmentType: ProductFulfillmentType,
    accountHolderProfile: AccountHolderProfile | null,
    previousThreePlId: string | null,
  ) {
    const none = { threePlCurrency: null, threePlPriceChargedOriginal: null, threePlPayoutOriginal: null };
    if (!threePlId) return { ...none, threePlPriceChargedSnapshot: null, threePlPayoutSnapshot: null };
    if (threePlId !== previousThreePlId && (await this.billingService.isSeatBlocked(threePlId))) {
      throw new ForbiddenException("This 3PL's seat is blocked pending payment");
    }
    const threePlProfile = await this.assertThreePlHandles(threePlId, fulfillmentType);
    // Originals only (Account Holder's / 3PL's currency) — the PKR snapshots are derived by convertOrderAmounts().
    return {
      threePlCurrency: await this.currencyOf(threePlId),
      threePlPriceChargedOriginal: accountHolderProfile?.threePlPriceCharged ?? 0,
      threePlPayoutOriginal: threePlProfile.payoutPerOrder,
      threePlPriceChargedSnapshot: null as number | null,
      threePlPayoutSnapshot: null as number | null,
    };
  }

  /**
   * Per-item snapshot of the product's current prices and its Stock Owner's share terms.
   * DROPSHIP: no product-level price yet — the assigned 3PL enters the buy price once they pick up
   * the order (see setDropshipBuyPrice below).
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
    };
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
    assertNotInvoiced(order);

    // DROPSHIP orders always have exactly one item.
    const item = order.items[0];
    const product = item ? await this.productModel.findByPk(item.productId) : null;
    if (!product || product.fulfillmentType !== ProductFulfillmentType.DROPSHIP) {
      throw new BadRequestException("Buy price can only be entered for DROPSHIP orders");
    }

    // The buy price the 3PL enters IS their payout for a DROPSHIP order — no separate rate.
    if (!order.exchangeRates) {
      // Pre-currency order: amounts stay plain PKR.
      item.buyPriceSnapshot = buyPrice;
      order.threePlPayoutSnapshot = buyPrice;
    } else {
      // Entered in the 3PL's own currency, converted with the order's locked rate for it.
      const currency = order.threePlCurrency ?? (await this.currencyOf(requester.sub));
      order.threePlCurrency = currency;
      item.currency = currency;
      item.buyPriceOriginal = buyPrice;
      order.threePlPayoutOriginal = buyPrice;
      if (!order.exchangeRates[currency]) {
        order.exchangeRates = { ...order.exchangeRates, ...(await this.exchangeRatesService.resolve([currency])) };
      }
      convertOrderAmounts(order, [item], order.exchangeRates);
    }
    await item.save();
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
      for (const item of order.items) {
        const product = await this.productModel.findByPk(item.productId);
        if (product) await adjustStock(product, item.quantity);
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
