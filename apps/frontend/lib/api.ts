import type {
  AccountHolderProfileDto,
  CompanyDto,
  InvoiceDto,
  OrderDto,
  OrderStatus,
  ProductDto,
  ProductFulfillmentType,
  Role,
  StaffPermissionsDto,
  StockOwnerProfileDto,
  ThreePlProfileDto,
  UserDto,
} from "@ebay-order-management/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Mirrors the backend's currentCycle()/toDateOnly() so filter defaults match a user's billing cycle without a round trip. */
export function computeCurrentCycle(anchorDay: number, today: Date = new Date()): { start: string; end: string } {
  let start = new Date(today.getFullYear(), today.getMonth(), anchorDay);
  if (start.getTime() > today.getTime()) {
    start = new Date(today.getFullYear(), today.getMonth() - 1, anchorDay);
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, anchorDay);
  const lastInclusiveDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toDateOnly(start), end: toDateOnly(lastInclusiveDay) };
}

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path}`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export interface StoredUser {
  id: string;
  email: string;
  roles: Role[];
  companyId: string | null;
  staffPermissions: StaffPermissionsDto | null;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.message ?? `Request failed: ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function login(email: string, password: string, role: Role) {
  return request<{ accessToken: string; user: StoredUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role, context: "portal" }),
  });
}

export function register(companyName: string, email: string, password: string, confirmPassword: string) {
  return request<{ companyId: string; userId: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ companyName, email, password, confirmPassword }),
  });
}

export function verifyEmail(token: string) {
  return request<{ message: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
}

export function verifyEmailCode(email: string, code: string) {
  return request<{ message: string }>("/auth/verify-email-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function forgotPassword(email: string) {
  return request<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, password: string, confirmPassword: string) {
  return request<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password, confirmPassword }),
  });
}

export function acceptInvite(token: string, password: string, confirmPassword: string) {
  return request<{ message: string }>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify({ token, password, confirmPassword }),
  });
}

export function seatStatus() {
  return request<{ paidThroughDate: string | null; blocked: boolean }>("/dashboard/seat-status");
}

export interface DashboardOrderFilters {
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
}

function dashboardQuery(filters: DashboardOrderFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface DailyPoint {
  date: string;
  value: number;
}

export interface AccountHolderDashboard {
  cycleStart: string;
  cycleEnd: string;
  listStart: string;
  listEnd: string;
  orderCount: number;
  totalProfit: number;
  orders: { orderId: string; ebayOrderRef: string; status: string; productId: string; quantity: number; profit: number; payout: number }[];
  payoutByDay: DailyPoint[];
  ordersByDay: DailyPoint[];
}

export function accountHolderDashboard(filters: DashboardOrderFilters = {}) {
  return request<AccountHolderDashboard>(`/dashboard/account-holder${dashboardQuery(filters)}`);
}

export interface StockOwnerDashboard {
  cycleStart: string;
  cycleEnd: string;
  listStart: string;
  listEnd: string;
  itemsSold: number;
  totalProfit: number;
  orders: { orderId: string; ebayOrderRef: string; status: string; productId: string; quantity: number; net: number }[];
  itemsSoldByDay: DailyPoint[];
  byProduct: { productId: string; quantity: number; net: number }[];
}

export function stockOwnerDashboard(filters: DashboardOrderFilters = {}) {
  return request<StockOwnerDashboard>(`/dashboard/stock-owner${dashboardQuery(filters)}`);
}

export interface ThreePlOrderRow {
  orderId: string;
  ebayOrderRef: string;
  status: string;
  productId: string;
  quantity: number;
  shippingLabelUrl: string | null;
  daysInStatus: number;
  stale: boolean;
}

export interface ThreePlDashboard {
  cycleStart: string;
  cycleEnd: string;
  listStart: string;
  listEnd: string;
  totalEarnings: number;
  toProcess: ThreePlOrderRow[];
  fulfilled: ThreePlOrderRow[];
  fulfilledByDay: DailyPoint[];
}

export function threePlDashboard(filters: DashboardOrderFilters = {}) {
  return request<ThreePlDashboard>(`/dashboard/three-pl${dashboardQuery(filters)}`);
}

export interface StaffDashboard {
  cycleStart: string;
  cycleEnd: string;
  totalCompanyProfit: number;
  orderCount: number;
  ordersByStatus: Record<string, number>;
  ordersPerUser: { userId: string; name: string; role: Role; byStatus: Record<string, number> }[];
  profitSeries: { date: string; accountHolders: number; threePl: number; stockOwners: number }[];
  ordersPerDay: DailyPoint[];
  ordersPerDayByAccountHolder: { accountHolderId: string; name: string; series: DailyPoint[] }[];
  userStats: { active: number; disabled: number; invited: number; byRole: Record<string, number> };
  productsPerStockOwner: { stockOwnerId: string; name: string; productCount: number; totalStockQuantity: number }[];
  agingOrders: {
    orderId: string;
    ebayOrderRef: string;
    status: string;
    productId: string;
    daysInStatus: number;
    accountHolderName: string;
    stockOwnerName: string;
    threePlName: string | null;
  }[];
  staleOrderDays: number;
  salesByAccountHolder: { accountHolderId: string; name: string; orderCount: number; profit: number }[];
}

export function staffDashboard() {
  return request<StaffDashboard>("/dashboard/staff");
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return request<OrderDto>(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function listMyInvoices(userId: string) {
  return request<InvoiceDto[]>(`/invoices?userId=${userId}`);
}

export function generateMyInvoice(userId: string, role: Role) {
  return request<InvoiceDto>("/invoices/generate", { method: "POST", body: JSON.stringify({ userId, role }) });
}

// --- Companies ---
export function getMyCompany() {
  return request<CompanyDto>("/companies/me");
}

export function updateCompanyName(name: string) {
  return request<CompanyDto>("/companies/me/name", { method: "POST", body: JSON.stringify({ name }) });
}

export function updateCompanyBillingAnchorDay(billingAnchorDay: number) {
  return request<CompanyDto>("/companies/me/billing-anchor-day", {
    method: "POST",
    body: JSON.stringify({ billingAnchorDay }),
  });
}

export async function uploadCompanyLogo(logo: File) {
  const form = new FormData();
  form.append("logo", logo);
  const res = await fetch(`${API_URL}/companies/me/logo`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<CompanyDto>;
}

// --- My profile (any logged-in user) ---
export function getMyProfile() {
  return request<UserDto>("/users/me");
}

export function updateMyProfile(payload: { name?: string }) {
  return request<UserDto>("/users/me", { method: "PATCH", body: JSON.stringify(payload) });
}

export function changeMyPassword(currentPassword: string, newPassword: string, confirmNewPassword: string) {
  return request<{ message: string }>("/users/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
  });
}

// --- Users (company self-management: ADMIN/STAFF-with-canManageUsers) ---
export function listUsers() {
  return request<UserDto[]>("/users");
}

export interface InviteUserPayload {
  name?: string;
  email: string;
  roles: Role[];
  staffPermissions?: StaffPermissionsDto;
  accountHolderProfile?: Pick<AccountHolderProfileDto, "sharePercent" | "threePlPriceCharged" | "billingCycleStartDay">;
  stockOwnerProfile?: Pick<StockOwnerProfileDto, "payoutMode" | "sharePercent" | "billingCycleStartDay">;
  threePlProfile?: Partial<Pick<ThreePlProfileDto, "payoutPerOrder">> &
    Pick<ThreePlProfileDto, "billingCycleStartDay" | "fulfillmentType">;
}

export function inviteUser(payload: InviteUserPayload) {
  return request<UserDto>("/users/invite", { method: "POST", body: JSON.stringify(payload) });
}

export function getUser(id: string) {
  return request<UserDto>(`/users/${id}`);
}

export function updateUser(id: string, payload: { name?: string }) {
  return request<UserDto>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updateThreePlProfile(
  id: string,
  payload: Partial<Pick<ThreePlProfileDto, "payoutPerOrder">> & Pick<ThreePlProfileDto, "billingCycleStartDay" | "fulfillmentType">,
) {
  return request<unknown>(`/users/${id}/three-pl-profile`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updateAccountHolderProfile(
  id: string,
  payload: Pick<AccountHolderProfileDto, "sharePercent" | "threePlPriceCharged" | "billingCycleStartDay">,
) {
  return request<unknown>(`/users/${id}/account-holder-profile`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updateStockOwnerProfile(
  id: string,
  payload: Pick<StockOwnerProfileDto, "payoutMode" | "sharePercent" | "billingCycleStartDay">,
) {
  return request<unknown>(`/users/${id}/stock-owner-profile`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function setUserStatus(userId: string, enable: boolean) {
  return request<UserDto>(`/users/${userId}/${enable ? "enable" : "disable"}`, { method: "PATCH" });
}

export function updateStaffPermissions(userId: string, dto: StaffPermissionsDto) {
  return request<unknown>(`/users/${userId}/staff-permissions`, { method: "PATCH", body: JSON.stringify(dto) });
}

// --- Products (company self-management: ADMIN/STAFF-with-canManageStock) ---
export function listProducts() {
  return request<ProductDto[]>("/products");
}

export interface CreateProductPayload {
  // Required for STOCK; omitted entirely for DROPSHIP products.
  stockOwnerId?: string;
  fulfillmentType: ProductFulfillmentType;
  threePlId?: string;
  sku: string;
  title: string;
  stockOwnerCost?: number;
  buyPrice?: number;
  sellPrice?: number;
  stockQuantity?: number;
}

export function createProduct(payload: CreateProductPayload) {
  return request<ProductDto>("/products", { method: "POST", body: JSON.stringify(payload) });
}

export function updateStock(productId: string, stockQuantity: number) {
  return request<ProductDto>(`/products/${productId}/stock`, { method: "PATCH", body: JSON.stringify({ stockQuantity }) });
}

export async function uploadProductImage(productId: string, image: File) {
  const form = new FormData();
  form.append("image", image);
  const res = await fetch(`${API_URL}/products/${productId}/image`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<ProductDto>;
}

// --- Orders (company self-management: ADMIN/STAFF-with-canManageOrders) ---
export interface OrderListFilters {
  accountHolderId?: string;
  threePlId?: string;
  status?: OrderStatus;
  startDate?: string;
  endDate?: string;
}

export function listOrders(filters: OrderListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.accountHolderId) params.set("accountHolderId", filters.accountHolderId);
  if (filters.threePlId) params.set("threePlId", filters.threePlId);
  if (filters.status) params.set("status", filters.status);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  const qs = params.toString();
  return request<OrderDto[]>(`/orders${qs ? `?${qs}` : ""}`);
}

export interface CreateOrderPayload {
  accountHolderId: string;
  productId: string;
  quantity: number;
  threePlId?: string;
  orderDate?: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost?: number;
  supplierUrl?: string;
}

export type UpdateOrderPayload = Partial<Omit<CreateOrderPayload, "quantity" | "threePlId" | "productId">>;

export function createOrder(payload: CreateOrderPayload) {
  return request<OrderDto>("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export function updateOrder(orderId: string, payload: UpdateOrderPayload) {
  return request<OrderDto>(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Assigned 3PL entering the buy price on a DROPSHIP order once it's visible to them (status past PENDING).
export function submitDropshipBuyPrice(orderId: string, buyPrice: number) {
  return request<OrderDto>(`/orders/${orderId}/dropship-buy-price`, { method: "PATCH", body: JSON.stringify({ buyPrice }) });
}

export async function uploadOrderShippingLabel(orderId: string, shippingLabel: File) {
  const form = new FormData();
  form.append("shippingLabel", shippingLabel);
  const res = await fetch(`${API_URL}/orders/${orderId}/shipping-label`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<OrderDto>;
}

// --- Invoices (company-wide admin view: ADMIN/STAFF-with-canGenerateInvoices/canViewFinancials) ---
export function listInvoices(userId?: string) {
  return request<InvoiceDto[]>(`/invoices${userId ? `?userId=${userId}` : ""}`);
}

export function generateInvoice(userId: string, role: Role) {
  return request<InvoiceDto>("/invoices/generate", { method: "POST", body: JSON.stringify({ userId, role }) });
}

export function markInvoicePaid(invoiceId: string) {
  return request<InvoiceDto>(`/invoices/${invoiceId}/mark-paid`, { method: "PATCH" });
}

// --- Billing (seat payments: ADMIN/STAFF-with-canManageUsers) ---
export function previewSeatCharge(userId: string, months: number) {
  return request<{ periodStart: string; periodEnd: string; months: number; amount: number }>(
    `/billing/preview?userId=${userId}&months=${months}`,
  );
}

export async function submitSeatOrder(items: { userId: string; months: number }[], referenceNote: string, receipt: File | null) {
  const form = new FormData();
  form.append("items", JSON.stringify(items));
  if (referenceNote) form.append("referenceNote", referenceNote);
  if (receipt) form.append("receipt", receipt);

  const res = await fetch(`${API_URL}/billing/seat-orders`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function listSeatOrders() {
  return request<unknown[]>("/billing/seat-orders");
}
