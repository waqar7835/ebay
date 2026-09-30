export enum Role {
  SUPER_ADMIN = "SUPER_ADMIN",
  PLATFORM_STAFF = "PLATFORM_STAFF",
  ADMIN = "ADMIN",
  STAFF = "STAFF",
  ACCOUNT_HOLDER = "ACCOUNT_HOLDER",
  STOCK_OWNER = "STOCK_OWNER",
  THREE_PL = "THREE_PL",
}

/**
 * Roles that live in the `backoffice_users` table and only ever sign in to the backoffice app.
 * Realm is enforced by which table a login queries, not by this list — kept for read-only
 * classification (e.g. Nav-link visibility).
 */
export const BACKOFFICE_ROLES: Role[] = [Role.SUPER_ADMIN, Role.PLATFORM_STAFF];

/** Roles that live in the `users` table and only ever sign in to the partner portal app. */
export const PORTAL_ROLES: Role[] = [Role.ADMIN, Role.STAFF, Role.ACCOUNT_HOLDER, Role.STOCK_OWNER, Role.THREE_PL];

export enum UserStatus {
  INVITED = "INVITED",
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
}

export enum OrderStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  SHIPPED = "SHIPPED",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export enum ProductFulfillmentType {
  STOCK = "STOCK",
  DROPSHIP = "DROPSHIP",
}

export enum StockOwnerPayoutMode {
  PROFIT_SHARE = "PROFIT_SHARE",
  FIXED = "FIXED",
}

export enum InvoiceStatus {
  UNPAID = "UNPAID",
  PAID = "PAID",
  /** A PAID invoice that was deleted: kept for the record, its orders are open again. */
  VOID = "VOID",
}

/** ORDER = one order's payout; REFUND = negative adjustment for an invoiced order later refunded; MISC = admin-added line. */
export enum InvoiceLineKind {
  ORDER = "ORDER",
  REFUND = "REFUND",
  MISC = "MISC",
}

export enum TokenPurpose {
  EMAIL_VERIFY = "EMAIL_VERIFY",
  PASSWORD_RESET = "PASSWORD_RESET",
  USER_INVITE = "USER_INVITE",
}

/**
 * Currencies a user's amounts can be entered in (Account Holder / Stock Owner / 3PL). Every order
 * converts them to PKR with the exchange rates snapshotted on the order; everything downstream
 * (financials, invoices, dashboards) is in PKR.
 */
export enum Currency {
  GBP = "GBP",
  USD = "USD",
  AUD = "AUD",
  EUR = "EUR",
  CAD = "CAD",
}

export const DEFAULT_CURRENCY = Currency.GBP;
export const BASE_CURRENCY = "PKR";

/** PKR per 1 unit of a currency, keyed by currency code. */
export type ExchangeRates = Partial<Record<Currency, number>>;

/** Latest known rate for one currency, as offered to the order form. */
export interface ExchangeRateDto {
  currency: Currency;
  /** PKR per 1 unit; null when no rate is known at all (admin must enter it). */
  rate: number | null;
  fetchedAt: string | null;
  /** True when the live API couldn't be reached and this is an older saved rate. */
  stale: boolean;
  /** True when there's no usable rate (API down and nothing saved within 7 days) — must be entered manually. */
  unavailable: boolean;
}

export interface StaffPermissionsDto {
  canManageOrders: boolean;
  canManageStock: boolean;
  canManageUsers: boolean;
  canGenerateInvoices: boolean;
  canViewFinancials: boolean;
  hasRevenueShare: boolean;
  sharePercent: number | null;
}

export interface AccountHolderProfileDto {
  sharePercent: number;
  threePlPriceCharged: number | null;
  billingCycleStartDay: number;
}

export interface StockOwnerProfileDto {
  payoutMode: StockOwnerPayoutMode;
  sharePercent: number | null;
  billingCycleStartDay: number;
}

export interface ThreePlProfileDto {
  payoutPerOrder: number;
  billingCycleStartDay: number;
  fulfillmentType: ProductFulfillmentType;
}

export interface UserDto {
  id: string;
  companyId: string | null;
  name: string | null;
  email: string;
  status: UserStatus;
  /** Currency this user's amounts are entered in (only meaningful for Account Holder / Stock Owner / 3PL). */
  currency: Currency;
  roles: Role[];
  staffProfile: StaffPermissionsDto | null;
  accountHolderProfile: AccountHolderProfileDto | null;
  stockOwnerProfile: StockOwnerProfileDto | null;
  threePlProfile: ThreePlProfileDto | null;
  createdAt: string;
}

export const PRODUCT_MAX_IMAGES = 4;

export interface ProductDto {
  id: string;
  companyId: string;
  // Null for DROPSHIP products: no Stock Owner, no prices, no stock held.
  stockOwnerId: string | null;
  fulfillmentType: ProductFulfillmentType;
  threePlId: string | null;
  sku: string;
  title: string;
  size: string | null;
  // Cover image — always imageUrls[0] (or null when the product has no images).
  imageUrl: string | null;
  // Up to PRODUCT_MAX_IMAGES, in display order; the first is the cover.
  imageUrls: string[];
  /** Prices below are in this currency — the Stock Owner's. Null for DROPSHIP products. */
  currency: Currency | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  createdAt: string;
  updatedAt: string;
}

/** One product line on an order, with its own price + Stock Owner snapshots. */
export interface OrderItemDto {
  id: string;
  orderId: string;
  productId: string;
  // Null for DROPSHIP items (no Stock Owner involved).
  stockOwnerId: string | null;
  position: number;
  quantity: number;
  /** Null on a DROPSHIP item until the assigned 3PL enters the buy price. */
  sellPriceSnapshot: number | null;
  buyPriceSnapshot: number | null;
  stockOwnerCostSnapshot: number | null;
  stockOwnerPayoutModeSnapshot: StockOwnerPayoutMode | null;
  stockOwnerSharePercentSnapshot: number | null;
  /**
   * Currency the *Original prices are in: the Stock Owner's (STOCK) or the 3PL's (DROPSHIP buy
   * price). The *Snapshot prices above are the PKR conversions. Null on orders from before currencies.
   */
  currency: Currency | null;
  sellPriceOriginal: number | null;
  buyPriceOriginal: number | null;
  stockOwnerCostOriginal: number | null;
  /** Invoice that paid this item out to its Stock Owner (null = open). */
  stockOwnerInvoiceId: string | null;
  stockOwnerRefundInvoiceId: string | null;
}

/** A product + quantity as sent when creating/editing an order. */
export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderDto {
  id: string;
  companyId: string;
  accountHolderId: string;
  /**
   * One or more products, in display order. Several items are only allowed for STOCK products
   * (all at the same 3PL); a DROPSHIP order always has exactly one.
   */
  items: OrderItemDto[];
  threePlId: string | null;
  status: OrderStatus;
  orderDate: string;
  ebayOrderRef: string;
  trackingNumber: string | null;
  shippingLabelUrl: string | null;
  /** Supplier/product listing link, admin-entered — used for DROPSHIP orders. */
  supplierUrl: string | null;
  statusChangedAt: string;
  buyerDetails: string;
  /** In PKR. The amount as entered (in the Account Holder's currency) is ebayNetProceedsOriginal. */
  ebayNetProceeds: number;
  /** In PKR. */
  shippingCost: number;
  /** 3PL fee in PKR — charged once per order, however many items it has. */
  threePlPriceChargedSnapshot: number | null;
  /** In PKR. */
  threePlPayoutSnapshot: number | null;
  accountHolderSharePercentSnapshot: number;
  /**
   * Currency snapshots + amounts as entered. Null on orders from before currencies existed (their
   * amounts are treated as PKR until the order is re-saved with "recalculate" ticked).
   */
  accountHolderCurrency: Currency | null;
  threePlCurrency: Currency | null;
  ebayNetProceedsOriginal: number | null;
  shippingCostOriginal: number | null;
  threePlPriceChargedOriginal: number | null;
  threePlPayoutOriginal: number | null;
  /** PKR per 1 unit of each currency used on this order, locked when the order was created (or last recalculated). */
  exchangeRates: ExchangeRates | null;
  exchangeRatesAt: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  /** Invoice that paid this order out to its Account Holder / 3PL (null = open for that role). Stock Owner status is per item. */
  accountHolderInvoiceId: string | null;
  accountHolderRefundInvoiceId: string | null;
  threePlInvoiceId: string | null;
  threePlRefundInvoiceId: string | null;
  /** Present on list responses only. Days since the order last changed status. */
  daysInStatus?: number;
  /** Present on list responses only. True when the order has sat in PENDING/PROCESSING/SHIPPED past the company's stale-order threshold. */
  stale?: boolean;
  /** Present on list responses only, and only for managers (ADMIN/STAFF/SUPER_ADMIN/PLATFORM_STAFF) — total company profit contribution from this order. */
  companyProfit?: number;
}

export interface OrderFinancials {
  accountHolderProfit: number;
  accountHolderPayout: number;
  companyRemainderFromOrder: number;
  productMarkup: number;
  threePlMarkup: number;
  stockOwnerGross: number;
  stockOwnerShareCut: number;
  stockOwnerNet: number;
  threePlPayout: number;
}

/** One product on a Stock Owner invoice line (PKR). */
export interface InvoiceLineProduct {
  productId: string;
  title: string;
  quantity: number;
  /** Stock Owner's cost per unit. */
  cost: number;
  /** What the company pays the Stock Owner per unit (the product's buy price). */
  price: number;
  payoutMode: StockOwnerPayoutMode | null;
  /** Company's cut of the profit, % (PROFIT_SHARE only). */
  sharePercent: number | null;
}

/** One product's slice of an Account Holder invoice line (invoice currency). */
export interface InvoiceAccountHolderProduct {
  productId: string;
  title: string;
  quantity: number;
  /** eBay net proceeds, allocated to this product. */
  selling: number;
  /** What the Account Holder owes for the product (the product's sell price × qty). */
  buying: number;
  /** 3PL charge allocated to this product. */
  threePl: number;
  /**
   * Shipping label bought outside eBay (paid by the company, reimbursed by the Account Holder),
   * allocated to this product. 0 when the label was bought on eBay — already out of the payout.
   */
  shipping: number;
}

/** Snapshot of how an invoice line was worked out, per role (PKR). */
export type InvoiceLineDetails =
  | { role: "STOCK_OWNER"; orderRef: string; orderDate: string; products: InvoiceLineProduct[] }
  | {
      /**
       * The Account Holder keeps the eBay money, so their invoice is what they owe the company:
       * the company's profit share + buying price + 3PL charges + any shipping label bought outside
       * eBay. Amounts in the invoice currency
       * (the Account Holder's own), split per product in proportion to each product's buying value.
       */
      role: "ACCOUNT_HOLDER";
      orderRef: string;
      orderDate: string;
      /** Company's share of the profit, % (100 − the Account Holder's share). */
      companySharePercent: number;
      products: InvoiceAccountHolderProduct[];
    }
  | { role: "THREE_PL"; orderRef: string; orderDate: string; units: number };

export interface InvoiceLineItemDto {
  id: string;
  orderId: string | null;
  kind: InvoiceLineKind;
  description: string;
  details: InvoiceLineDetails | null;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  position: number;
}

/** Roles an invoice can be made for. */
export type InvoiceRole = Role.ACCOUNT_HOLDER | Role.STOCK_OWNER | Role.THREE_PL;

export interface InvoiceDto {
  id: string;
  companyId: string;
  userId: string;
  role: InvoiceRole;
  /** Human-readable, per company, e.g. AD-2026-007. */
  invoiceNumber: string;
  status: InvoiceStatus;
  /** PKR for Stock Owner / 3PL invoices; the Account Holder's own currency on theirs. */
  currency: string;
  /**
   * Stock Owner / 3PL: what the company pays the user. Account Holder: what the user pays the
   * company (they hold the eBay proceeds).
   */
  totalAmount: number;
  generatedByUserId: string;
  generatedAt: string;
  paidAt: string | null;
  voidedAt: string | null;
  lineItems: InvoiceLineItemDto[];
  user?: { id: string; name: string | null; email: string };
}

/** An order the invoice wizard can put on an invoice for the chosen user+role (amounts in `currency`). */
export interface InvoiceableOrderDto {
  orderId: string;
  ebayOrderRef: string;
  orderDate: string;
  status: OrderStatus;
  /** REFUND = already invoiced for this user and since refunded — adds a negative adjustment. */
  kind: InvoiceLineKind.ORDER | InvoiceLineKind.REFUND;
  description: string;
  currency: string;
  /**
   * Saved before currencies existed (no locked rates), so its amounts are ambiguous: it can't be
   * invoiced until it's re-saved with "Recalculate with today's rates".
   */
  needsRecalculation: boolean;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
}

export interface InvoiceMiscLineInput {
  title: string;
  /** In the invoice currency; added to the invoice total (negative reduces it). */
  amount: number;
}

/** What the wizard sends to preview (PDF) and to create an invoice. */
export interface InvoiceDraftInput {
  userId: string;
  role: InvoiceRole;
  orderIds: string[];
  refundOrderIds: string[];
  miscLines: InvoiceMiscLineInput[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompanyDto {
  id: string;
  name: string;
  logoUrl: string | null;
  emailVerifiedAt: string | null;
  billingAnchorDay: number;
  staleOrderDays: number;
  /** Preselected currency when inviting Account Holders / Stock Owners / 3PLs (new users only). */
  defaultCurrency: Currency;
  createdAt: string;
}

/** Permission flags for a backoffice PLATFORM_STAFF user — global (not tied to one company). */
export interface BackofficePermissionsDto {
  canManageOrders: boolean;
  canManageStock: boolean;
  canManageUsers: boolean;
  canGenerateInvoices: boolean;
  canViewFinancials: boolean;
}

export interface BackofficeUserDto {
  id: string;
  name: string | null;
  email: string;
  status: UserStatus;
  role: Role;
  backofficeStaffProfile: BackofficePermissionsDto | null;
  createdAt: string;
}
