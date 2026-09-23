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
}

export enum TokenPurpose {
  EMAIL_VERIFY = "EMAIL_VERIFY",
  PASSWORD_RESET = "PASSWORD_RESET",
  USER_INVITE = "USER_INVITE",
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
  roles: Role[];
  staffProfile: StaffPermissionsDto | null;
  accountHolderProfile: AccountHolderProfileDto | null;
  stockOwnerProfile: StockOwnerProfileDto | null;
  threePlProfile: ThreePlProfileDto | null;
  createdAt: string;
}

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
  imageUrl: string | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDto {
  id: string;
  companyId: string;
  accountHolderId: string;
  // Null for DROPSHIP orders (no Stock Owner involved).
  stockOwnerId: string | null;
  productId: string;
  quantity: number;
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
  ebayNetProceeds: number;
  shippingCost: number;
  /** Null on a DROPSHIP order until the assigned 3PL enters the buy price. */
  sellPriceSnapshot: number | null;
  buyPriceSnapshot: number | null;
  stockOwnerCostSnapshot: number | null;
  threePlPriceChargedSnapshot: number | null;
  threePlPayoutSnapshot: number | null;
  accountHolderSharePercentSnapshot: number;
  stockOwnerPayoutModeSnapshot: StockOwnerPayoutMode | null;
  stockOwnerSharePercentSnapshot: number | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
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

export interface InvoiceLineItemDto {
  id: string;
  orderId: string | null;
  description: string;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  isAdjustment: boolean;
}

export interface InvoiceDto {
  id: string;
  companyId: string;
  userId: string;
  role: Role;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  totalAmount: number;
  generatedByUserId: string;
  generatedAt: string;
  paidAt: string | null;
  lineItems: InvoiceLineItemDto[];
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
