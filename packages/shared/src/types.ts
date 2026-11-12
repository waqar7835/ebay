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
  /** Partner (replaces "Revenue share", 2026-11-05): takes partnerPercent% of each billing cycle's company profit. */
  isPartner: boolean;
  partnerPercent: number | null;
  /** Can generate / delete profit statements (partners only; the Admin always can). */
  canManageProfitStatements: boolean;
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
  /** DROPSHIP 3PLs: % taken off the buy prices they enter — they're paid the rest (default 10). */
  dropshipDiscountPercent: number;
  /**
   * Auto-delivery: orders this 3PL marks shipped after it was switched on (`autoDeliveryEnabledAt`) move to DELIVERED
   * once `deliveryDays` have passed — a STOCK order only once it has a tracking number. Off by default.
   */
  autoDeliveryEnabled: boolean;
  deliveryDays: number | null;
  autoDeliveryEnabledAt: string | null;
}

export interface UserDto {
  id: string;
  companyId: string | null;
  name: string | null;
  email: string;
  /** Profile picture (uploads path or absolute R2 URL), or null to show initials. */
  avatarUrl: string | null;
  status: UserStatus;
  /** True when the account was switched off because the company's subscription expired (not by an admin). */
  disabledBySubscription: boolean;
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

/**
 * Units of a STOCK product held at one 3PL (decided 2026-11-03: a product can be at several 3PLs, each with its own
 * quantity; variations share their main product's 3PLs). Can be negative (orders may go past the stock on hand).
 */
export interface ProductStockDto {
  threePlId: string;
  /** The 3PL's name (email when unnamed). */
  threePlName: string;
  quantity: number;
}

/** One 3PL row as sent when creating / editing a STOCK product. */
export interface ProductStockInput {
  threePlId: string;
  quantity: number;
}

export interface ProductDto {
  id: string;
  companyId: string;
  // Null for DROPSHIP products: no Stock Owner, no prices, no stock held.
  stockOwnerId: string | null;
  fulfillmentType: ProductFulfillmentType;
  sku: string;
  title: string;
  /** Set on a variation: its main product (title, type, Stock Owner and list of 3PLs always match it). */
  parentProductId: string | null;
  /** Order among the main product's variations. */
  position: number;
  color: string | null;
  size: string | null;
  /**
   * Main products only, on GET /products/:id and paged lists: its variations (each a product of its own, with its
   * own SKU, prices, stock and images), in order. Whole-list responses list variations as separate products instead.
   */
  variations?: ProductDto[];
  // Cover image — always imageUrls[0] (or null when the product has no images).
  imageUrl: string | null;
  // Up to PRODUCT_MAX_IMAGES, in display order; the first is the cover.
  imageUrls: string[];
  /** Prices below are in this currency — the Stock Owner's. Null for DROPSHIP products. */
  currency: Currency | null;
  /** The Stock Owner's name (their email when unnamed); null for DROPSHIP products. */
  stockOwnerName?: string | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  /**
   * Total over `stocks`. For a 3PL viewer it's that 3PL's own quantity only (they only receive products held with
   * them, without prices).
   */
  stockQuantity: number;
  /**
   * STOCK products: units per 3PL, in the order they were added. Managers and Stock Owners get every row, a 3PL only
   * its own, Account Holders none (they see the total only). Empty for DROPSHIP.
   */
  stocks: ProductStockDto[];
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
  /** Null on DROPSHIP items — their buy price is the line total in buyTotalSnapshot. */
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
  /**
   * DROPSHIP only: what the 3PL paid for this line, all units together (PKR / as entered in the 3PL's
   * currency). Null until the admin or the 3PL enters it; always null on STOCK items.
   */
  buyTotalSnapshot: number | null;
  buyTotalOriginal: number | null;
  /**
   * DROPSHIP only: the "client buying price" — what the company charges the Account Holder for this line,
   * all units together (PKR / as entered in the order's Account Holder currency). Null until entered.
   * Never sent to 3PLs; the buy totals above are never sent to Account Holders.
   */
  clientTotalSnapshot: number | null;
  clientTotalOriginal: number | null;
  /** Invoice that paid this item out to its Stock Owner (null = open). */
  stockOwnerInvoiceId: string | null;
  stockOwnerRefundInvoiceId: string | null;
}

/** A product + quantity as sent when creating/editing an order. */
export interface OrderItemInput {
  productId: string;
  quantity: number;
  /**
   * DROPSHIP only, optional: the line's buy price for all units, in the order's 3PL's currency (needs a
   * 3PL). On edit, omitted = keep the current one, null = clear it.
   */
  buyTotal?: number | null;
  /**
   * DROPSHIP only, optional: the client buying price for all units, in the order's Account Holder's
   * currency. On edit, omitted = keep the current one, null = clear it.
   */
  clientTotal?: number | null;
}

export interface OrderDto {
  id: string;
  companyId: string;
  accountHolderId: string;
  /**
   * One or more products, in display order. An order is all-STOCK (all held at the same 3PL) or
   * all-DROPSHIP (any dropship products, one optional 3PL); the type can't change once created.
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
  /** Admin/Staff notes for the 3PL; null for Account Holders / Stock Owners (never sent to them). */
  comments: string | null;
  /** A DROPSHIP 3PL's own notes (set by it only, any status); managers see them read-only, AH / SO never. */
  threePlNotes: string | null;
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
   * amounts are treated as PKR until the order is next saved, which converts them with today's rates).
   */
  accountHolderCurrency: Currency | null;
  threePlCurrency: Currency | null;
  ebayNetProceedsOriginal: number | null;
  shippingCostOriginal: number | null;
  threePlPriceChargedOriginal: number | null;
  threePlPayoutOriginal: number | null;
  /**
   * DROPSHIP: the 3PL's discount %, locked on the order when its 3PL is set (null = 0). The 3PL is paid each line's
   * buy total minus this % ("admin buy price"); threePlPayout* is that sum. Null for Account Holders / Stock Owners.
   */
  threePlDiscountPercent: number | null;
  /**
   * PKR per 1 unit of each currency used on this order: today's rates as of its last save by Admin/Staff (every save
   * refreshes them). They stay frozen while the order is on an invoice, since an invoiced order can't be edited.
   */
  exchangeRates: ExchangeRates | null;
  exchangeRatesAt: string | null;
  /**
   * Only on the response to a save / status change that should have moved stock at a 3PL that's no longer on the
   * product (decided 2026-11-03): no stock moved for those lines, and each message asks the admin to adjust it by hand.
   */
  stockWarnings?: string[];
  /** Its units are back in stock (cancelled, or refunded with the product coming back), so it holds none. */
  restocked: boolean;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  /** When the order was last marked SHIPPED (what 3PL auto-delivery counts from). */
  shippedAt: string | null;
  /**
   * REFUNDED orders: the refunded part of the eBay payout, in PKR / as entered in the Account Holder's currency
   * (equal to the payout for a full refund — dropship orders are always refunded in full). Null otherwise.
   */
  refundAmount: number | null;
  refundAmountOriginal: number | null;
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
  | {
      role: "THREE_PL";
      orderRef: string;
      orderDate: string;
      units: number;
      // Snapshotted since 2026-09-30 (absent on older invoices, which show blanks):
      /** STOCK = the 3PL's fee per order; DROPSHIP = the buy price the 3PL paid for the product. */
      fulfillment?: ProductFulfillmentType;
      status?: OrderStatus;
      trackingNumber?: string | null;
      products?: { title: string; quantity: number }[];
      /**
       * DROPSHIP, since 2026-10-27: the buy prices the 3PL entered (PKR) and the % taken off them; the line's amount is
       * what it's paid. Absent on older lines (paid the full buy price).
       */
      buyTotal?: number;
      discountPercent?: number | null;
    };

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
  /** The template style frozen at approval; null = issued before templates (drawn in the original style). */
  template: InvoiceTemplateSnapshot | null;
  lineItems: InvoiceLineItemDto[];
  user?: { id: string; name: string | null; email: string };
}

/** An order the invoice wizard can put on an invoice for the chosen user+role (amounts in `currency`). */
export interface InvoiceableOrderDto {
  orderId: string;
  ebayOrderRef: string;
  orderDate: string;
  status: OrderStatus;
  /**
   * REFUND = already invoiced for this user and since refunded — adds a negative adjustment (what they give back, or
   * for an Account Holder what the company gives back; decided 2026-10-12). A STOCK 3PL is never charged back. An
   * ORDER row of a refunded order not invoiced yet has its refund netted in (both lines go on the invoice).
   */
  kind: InvoiceLineKind.ORDER | InvoiceLineKind.REFUND;
  description: string;
  currency: string;
  /**
   * Saved before currencies existed (no locked rates), so its amounts are ambiguous: it can't be
   * invoiced until it's edited and saved (which converts it with today's rates).
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
  /** Predefined template key or custom template id; omitted = the company's default template. */
  templateId?: string;
}

// --- Invoice templates ---

/** Fixed PDF layouts; a template is a layout + colors + (optionally) its own logo. */
export enum InvoiceLayout {
  CLASSIC = "CLASSIC",
  SPLIT = "SPLIT",
  SIDEBAR = "SIDEBAR",
  CARDS = "CARDS",
  BOLD = "BOLD",
}

export interface InvoiceTemplateColors {
  /** Page / body base. */
  background: string;
  /** Heading backgrounds, table headers, bars, the total panel. */
  accent: string;
  /** Text drawn on accent backgrounds. */
  headingText: string;
  /** Body text. */
  text: string;
  /** Borders, dividers and rules. */
  border: string;
}

export const INVOICE_TEMPLATE_COLOR_KEYS: (keyof InvoiceTemplateColors)[] = [
  "background",
  "accent",
  "headingText",
  "text",
  "border",
];

/**
 * Text drawn over every page of an invoice PDF. Saved even while `enabled` is false, so switching it
 * back on restores the settings. When enabled it replaces the DRAFT mark (VOID is still drawn on top).
 */
export interface InvoiceWatermark {
  enabled: boolean;
  text: string;
  /** Hex color of the text. */
  color: string;
  /** Font size in points. */
  size: number;
  /** Opacity in percent (higher = more visible). */
  opacity: number;
  /** Degrees; 0 = flat, positive = turned clockwise, negative = counter-clockwise. */
  rotation: number;
  /** Tile the text across the page instead of one copy in the center. */
  repeat: boolean;
  /** Gap between repeated copies, in points. */
  gapX: number;
  gapY: number;
}

export const INVOICE_WATERMARK_LIMITS = {
  text: 60,
  size: { min: 12, max: 150 },
  opacity: { min: 5, max: 60 },
  rotation: { min: -90, max: 90 },
  gap: { min: 20, max: 300 },
} as const;

/** A new watermark's settings; the editor fills `text` with the company name. */
export const DEFAULT_INVOICE_WATERMARK: InvoiceWatermark = {
  enabled: false,
  text: "",
  color: "#94a3b8",
  size: 48,
  opacity: 12,
  rotation: 0,
  repeat: false,
  gapX: 80,
  gapY: 80,
};

/** Custom templates a company can save, on top of the predefined ones. */
export const MAX_CUSTOM_INVOICE_TEMPLATES = 5;

/** The predefined templates — one per layout, with its default colors. Their ids are fixed keys. */
export const PREDEFINED_INVOICE_TEMPLATES: { id: string; name: string; layout: InvoiceLayout; colors: InvoiceTemplateColors }[] = [
  {
    id: "classic",
    name: "Classic",
    layout: InvoiceLayout.CLASSIC,
    colors: { background: "#ffffff", accent: "#1e293b", headingText: "#ffffff", text: "#334155", border: "#c9971c" },
  },
  {
    id: "split",
    name: "Split Header",
    layout: InvoiceLayout.SPLIT,
    colors: { background: "#ffffff", accent: "#0369a1", headingText: "#ffffff", text: "#0f172a", border: "#bae6fd" },
  },
  {
    id: "sidebar",
    name: "Sidebar",
    layout: InvoiceLayout.SIDEBAR,
    colors: { background: "#ffffff", accent: "#064e3b", headingText: "#ecfdf5", text: "#1f2937", border: "#a7f3d0" },
  },
  {
    id: "cards",
    name: "Soft Cards",
    layout: InvoiceLayout.CARDS,
    colors: { background: "#fff7ed", accent: "#ea580c", headingText: "#ffffff", text: "#431407", border: "#fed7aa" },
  },
  {
    id: "bold",
    name: "Bold",
    layout: InvoiceLayout.BOLD,
    colors: { background: "#ffffff", accent: "#be185d", headingText: "#ffffff", text: "#111827", border: "#111827" },
  },
];

/** Used when a company has no default set (and when its default custom template is deleted). */
export const DEFAULT_INVOICE_TEMPLATE_ID = "classic";

export interface InvoiceTemplateDto {
  /** Predefined: its fixed key (e.g. "classic"); custom: a UUID. */
  id: string;
  name: string;
  layout: InvoiceLayout;
  colors: InvoiceTemplateColors;
  /** The template's own logo; null = the company logo is used. */
  logoUrl: string | null;
  /** null = no watermark has been set up. */
  watermark: InvoiceWatermark | null;
  predefined: boolean;
  /** Predefined only: the company has edited it (and can reset it to the original). */
  customized: boolean;
}

export interface InvoiceTemplatesDto {
  templates: InvoiceTemplateDto[];
  defaultTemplateId: string;
}

/** Saved on the invoice at approval, so its PDF never changes when the template is later edited. */
export interface InvoiceTemplateSnapshot {
  templateId: string;
  name: string;
  layout: InvoiceLayout;
  colors: InvoiceTemplateColors;
  /** The template's logo, or the company logo at the time; null = none. */
  logoUrl: string | null;
  /** Missing on invoices approved before watermarks; only an enabled one is drawn. */
  watermark?: InvoiceWatermark | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Rows-per-page choices on the paged Products / Orders / Users lists; the API caps pageSize at the largest. */
export const LIST_PAGE_SIZES = [50, 100, 150, 200, 250] as const;
export const DEFAULT_LIST_PAGE_SIZE = 50;

/**
 * A page of the orders list. `statusCounts` counts the orders matching every filter except status (one entry per
 * status, plus NO_TRACKING = SHIPPED/DELIVERED without a tracking number), for the status cards above the list.
 */
export interface OrderListPage extends PaginatedResult<OrderDto> {
  statusCounts: Record<string, number>;
}

/** A page of the company users list; `subscriptionDisabled` counts every account (not just this page) disabled by an expired subscription. */
export interface UserListPage extends PaginatedResult<UserDto> {
  subscriptionDisabled: number;
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

// --- Subscriptions ---

/** Roles whose accounts count against a subscription plan's limits (the company Admin never does). */
export const SEAT_LIMITED_ROLES: Role[] = [Role.ACCOUNT_HOLDER, Role.STOCK_OWNER, Role.THREE_PL, Role.STAFF];

export enum SubscriptionPaymentStatus {
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export interface SubscriptionPlanDto {
  id: string;
  name: string;
  description: string | null;
  /** PKR per month, before any billing-period discount. 0 for the free plan. */
  pricePerMonth: number;
  maxAccountHolders: number;
  maxStockOwners: number;
  maxThreePls: number;
  maxStaff: number;
  /** Exactly one plan is free: every company without an active paid subscription is on it. */
  isFree: boolean;
  /** Inactive plans can't be bought any more; companies already on them keep them until expiry. */
  isActive: boolean;
  sortOrder: number;
}

/** A duration companies can pay for (1 / 3 / 6 / 12 months…), with its discount off the monthly price. */
export interface BillingPeriodDto {
  id: string;
  months: number;
  discountPercent: number;
  isActive: boolean;
}

export interface SeatUsageDto {
  role: Role;
  used: number;
  limit: number;
}

export interface SubscriptionPaymentDto {
  id: string;
  companyId: string;
  companyName?: string;
  planId: string;
  planName: string;
  months: number;
  pricePerMonth: number;
  discountPercent: number;
  /** PKR: pricePerMonth × months, less the discount. */
  amount: number;
  status: SubscriptionPaymentStatus;
  receiptFileUrl: string | null;
  referenceNote: string | null;
  /** The dates the payment covered, set on approval (inclusive). */
  periodStart: string | null;
  periodEnd: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CompanySubscriptionDto {
  plan: SubscriptionPlanDto;
  /** Last day (inclusive) of the paid plan; null on the free plan. */
  endsAt: string | null;
  daysLeft: number | null;
  usage: SeatUsageDto[];
  pendingPayment: SubscriptionPaymentDto | null;
}

// --- Public marketing site ---

/** GET /public/pricing: active plans and billing periods, no login needed. */
export interface PublicPricingDto {
  plans: SubscriptionPlanDto[];
  periods: BillingPeriodDto[];
}

export enum ContactTopic {
  SALES = "SALES",
  SUPPORT = "SUPPORT",
  BILLING = "BILLING",
  OTHER = "OTHER",
}

/** POST /public/contact. `website` is a honeypot real visitors leave empty. */
export interface ContactMessageInput {
  topic: ContactTopic;
  name: string;
  email: string;
  company?: string;
  role: string;
  message: string;
  website?: string;
}

// --- Platform settings (Super Admin, backoffice) ---

export interface ReplyHoursRow {
  days: string;
  hours: string;
}

/** What the public site may show: no contact-form destination, no SMTP details. GET /public/site. */
export interface PublicSiteDto {
  brandName: string;
  logoUrl: string | null;
  /** Browser-tab icon as uploaded; null = clients fall back to `logoUrl`. */
  faviconUrl: string | null;
  helloEmail: string | null;
  supportEmail: string | null;
  replyHours: ReplyHoursRow[];
  replyTimezone: string | null;
}

/** GET /platform-settings (Super Admin). The SMTP password is never returned, only whether one is saved. */
export interface PlatformSettingsDto extends PublicSiteDto {
  contactEmail: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  mailFromName: string | null;
  mailFromEmail: string | null;
  /** "smtp" when a host is set and emails are really sent; "log" when they are only written to the server log. */
  emailDelivery: "smtp" | "log";
}

/** PATCH /platform-settings. Omit `smtpPassword` to keep the saved one; send `clearSmtpPassword: true` to remove it. */
export interface UpdatePlatformSettingsInput {
  brandName: string;
  helloEmail: string | null;
  supportEmail: string | null;
  contactEmail: string | null;
  replyHours: ReplyHoursRow[];
  replyTimezone: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
  mailFromName: string | null;
  mailFromEmail: string | null;
}

// --- Profit split, expenses & profit statements (decided 2026-11-05) ---

export enum ExpenseChargedTo {
  COMPANY = "COMPANY",
  /** The company Admin or a partner — `chargedToUserId`. */
  USER = "USER",
}

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  position: number;
}

export interface ExpenseDto {
  id: string;
  title: string;
  /** PKR. */
  amount: number;
  /** YYYY-MM-DD — picks the billing cycle it's deducted in. */
  expenseDate: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  chargedTo: ExpenseChargedTo;
  chargedToUserId: string | null;
  chargedToName: string;
  createdByUserId: string;
  createdByName: string;
  /** Set once the expense's cycle has a profit statement — it can't be changed then. */
  profitStatementId: string | null;
  createdAt: string;
}

export interface ExpenseInput {
  title: string;
  amount: number;
  expenseDate: string;
  categoryId?: string | null;
  notes?: string | null;
  chargedTo: ExpenseChargedTo;
  chargedToUserId?: string | null;
}

/** One person in the profit split. */
export interface ProfitSplitMemberDto {
  userId: string;
  name: string;
  /** ADMIN = the company Admin; PARTNER = a partner (Staff). */
  kind: "ADMIN" | "PARTNER";
  percent: number;
}

export interface ProfitSplitSettingsDto {
  admin: ProfitSplitMemberDto;
  partners: ProfitSplitMemberDto[];
  /** 100 − Admin − partners. */
  companyPercent: number;
  openingBalance: number | null;
  /** YYYY-MM-DD: first cycle that gets profit statements. */
  openingCycleStart: string | null;
  billingAnchorDay: number;
}

export interface ProfitSplitSettingsInput {
  adminPercent: number;
  partners: { userId: string; percent: number }[];
  openingBalance: number | null;
  openingCycleStart: string | null;
}

/** One order's company profit, broken down by where it came from (PKR). */
export interface ProfitOrderLineDto {
  orderId: string;
  ebayOrderRef: string;
  orderDate: string;
  invoiceNumber: string | null;
  /** When it's in this cycle only because it was missed by an earlier one (invoice edited after that was generated). */
  late: boolean;
  accountHolderShare: number;
  productMarkup: number;
  stockOwnerCut: number;
  threePlMarkup: number;
  total: number;
}

/** Profit from one person / source, with the orders behind it. */
export interface ProfitSourceGroupDto {
  /** AH / SO / 3PL user id; null for "Dropship markup" (no Stock Owner). */
  userId: string | null;
  name: string;
  amount: number;
  orderCount: number;
  orders: { orderId: string; ebayOrderRef: string; amount: number }[];
}

export interface ProfitRefundLineDto {
  orderId: string;
  ebayOrderRef: string;
  /** e.g. "full refund", "partial refund of 5.00 GBP". */
  note: string;
  invoiceNumber: string | null;
  late: boolean;
  /** What the company credits the Account Holder back (shown negative). */
  accountHolderCredit: number;
  /** What the Stock Owner gives back, or is never paid. */
  stockOwnerReturn: number;
  /** What a dropship 3PL pays back, or is never paid. */
  threePlPayback: number;
  /** The hit to company profit (negative = loss). */
  net: number;
}

export interface ProfitMiscLineDto {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string;
  /** AH invoice = money in, SO / 3PL invoice = money out. */
  role: Role;
  partyName: string;
  title: string;
  /** As on the invoice, in its currency. */
  amountOriginal: number;
  currency: string;
  /** Effect on company profit, PKR (+ in / − out). */
  amount: number;
  late: boolean;
}

export interface ProfitExpenseSummaryDto {
  id: string;
  title: string;
  amount: number;
  expenseDate: string;
  categoryName: string | null;
  notes: string | null;
  createdByName: string;
}

/** One row of the split: the company, the Admin or a partner. */
export interface ProfitShareRowDto {
  kind: "COMPANY" | "ADMIN" | "PARTNER";
  userId: string | null;
  name: string;
  percent: number;
  share: number;
  expenses: number;
  expenseLines: ProfitExpenseSummaryDto[];
  /** Company only: carried over from the previous cycle (or the opening balance). */
  broughtForward: number | null;
  /** Admin / partner: share − expenses. Company: share − expenses + brought forward. */
  netInHand: number;
}

export interface ProfitCycleSummaryDto {
  cycleStart: string;
  cycleEnd: string;
  /** GENERATED = frozen statement; OPEN = ended, can be generated; CURRENT = still running (draft only). */
  status: "GENERATED" | "OPEN" | "CURRENT";
  statementId: string | null;
  statementNumber: string | null;
}

export interface ProfitCycleDto extends ProfitCycleSummaryDto {
  generatedAt: string | null;
  generatedByName: string | null;
  orders: ProfitOrderLineDto[];
  byAccountHolder: ProfitSourceGroupDto[];
  byStockOwner: ProfitSourceGroupDto[];
  byThreePl: ProfitSourceGroupDto[];
  totals: {
    accountHolderShare: number;
    productMarkup: number;
    stockOwnerCut: number;
    threePlMarkup: number;
    orders: number;
    refunds: number;
    misc: number;
    /** orders + refunds + misc — what's split. */
    profit: number;
    expenses: number;
  };
  refunds: ProfitRefundLineDto[];
  misc: ProfitMiscLineDto[];
  shares: ProfitShareRowDto[];
  /** Company net in hand at the end of the cycle. */
  companyClosingBalance: number;
  /** Live only (null on a generated statement): approx. company profit of orders with no Account Holder invoice yet. */
  estimate: { orderCount: number; profit: number } | null;
  /** True when this cycle can be generated now (ended, previous generated, requester allowed). */
  canGenerate: boolean;
  /** Why it can't be generated, when it can't. */
  generateBlockedReason: string | null;
  /** Only the latest statement can be deleted. */
  canDelete: boolean;
}

export interface ProfitOverviewDto {
  cycles: ProfitCycleSummaryDto[];
  canManageStatements: boolean;
  canManageSettings: boolean;
  /** Set when no opening cycle is configured yet. */
  needsSetup: boolean;
}
