import type {
  AccountHolderProfileDto,
  BillingPeriodDto,
  CompanyDto,
  ContactMessageInput,
  CompanySubscriptionDto,
  Currency,
  ExchangeRateDto,
  ExchangeRates,
  InvoiceableOrderDto,
  InvoiceDraftInput,
  InvoiceDto,
  InvoiceLayout,
  InvoiceRole,
  InvoiceTemplateColors,
  InvoiceTemplateDto,
  InvoiceTemplatesDto,
  InvoiceWatermark,
  OrderDto,
  OrderItemInput,
  OrderStatus,
  ProductDto,
  ProductFulfillmentType,
  PublicPricingDto,
  Role,
  StaffPermissionsDto,
  StockOwnerProfileDto,
  SubscriptionPaymentDto,
  SubscriptionPlanDto,
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
  const lastInclusiveDay = new Date(start.getFullYear(), start.getMonth() + 1, anchorDay - 1);
  return { start: localDateOnly(start), end: localDateOnly(lastInclusiveDay) };
}

/** YYYY-MM-DD from local date parts — toISOString() would shift local midnight back a day east of UTC. */
export function localDateOnly(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** Like request(), for endpoints that return a file (PDFs). */
async function requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.blob();
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

export function resendVerification(email: string) {
  return request<{ message: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
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

// --- Public marketing site (no login) ---

export function getPublicPricing() {
  return request<PublicPricingDto>("/public/pricing");
}

export function sendContactMessage(input: ContactMessageInput) {
  return request<{ message: string }>("/public/contact", { method: "POST", body: JSON.stringify(input) });
}

export function accountStatus() {
  return request<{ disabled: boolean }>("/dashboard/account-status");
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

/** One product line of an order in dashboard lists (a Stock Owner only sees their own). */
export interface DashboardOrderItem {
  productId: string;
  quantity: number;
}

export interface AccountHolderDashboard {
  cycleStart: string;
  cycleEnd: string;
  listStart: string;
  listEnd: string;
  orderCount: number;
  totalProfit: number;
  orders: { orderId: string; ebayOrderRef: string; status: string; items: DashboardOrderItem[]; quantity: number; profit: number; payout: number }[];
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
  orders: { orderId: string; ebayOrderRef: string; status: string; items: DashboardOrderItem[]; quantity: number; net: number }[];
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
  items: DashboardOrderItem[];
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
    items: DashboardOrderItem[];
    daysInStatus: number;
    accountHolderName: string;
    stockOwnerName: string | null;
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

// --- Companies ---
export function getMyCompany() {
  return request<CompanyDto>("/companies/me");
}

export function updateCompanyName(name: string) {
  return request<CompanyDto>("/companies/me/name", { method: "POST", body: JSON.stringify({ name }) });
}

export function updateCompanyDefaultCurrency(defaultCurrency: Currency) {
  return request<CompanyDto>("/companies/me/default-currency", {
    method: "POST",
    body: JSON.stringify({ defaultCurrency }),
  });
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

async function uploadAvatar(path: string, file: File) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<UserDto>;
}

export function uploadMyAvatar(file: File) {
  return uploadAvatar("/users/me/avatar", file);
}

/** Admin / Staff with canManageUsers: set another user's picture. */
export function uploadUserAvatar(userId: string, file: File) {
  return uploadAvatar(`/users/${userId}/avatar`, file);
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
  currency?: Currency;
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

export function updateUser(id: string, payload: { name?: string; currency?: Currency }) {
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

export function deleteUser(userId: string) {
  return request<{ deleted: boolean }>(`/users/${userId}`, { method: "DELETE" });
}

export function updateStaffPermissions(userId: string, dto: StaffPermissionsDto) {
  return request<unknown>(`/users/${userId}/staff-permissions`, { method: "PATCH", body: JSON.stringify(dto) });
}

// --- Products (company self-management: ADMIN/STAFF-with-canManageStock) ---
export function listProducts() {
  return request<ProductDto[]>("/products");
}

export function getProduct(productId: string) {
  return request<ProductDto>(`/products/${productId}`);
}

export interface CreateProductPayload {
  // Required for STOCK; omitted entirely for DROPSHIP products.
  stockOwnerId?: string;
  fulfillmentType: ProductFulfillmentType;
  threePlId?: string;
  sku: string;
  title: string;
  size?: string;
  stockOwnerCost?: number;
  buyPrice?: number;
  sellPrice?: number;
  stockQuantity?: number;
}

export function createProduct(payload: CreateProductPayload) {
  return request<ProductDto>("/products", { method: "POST", body: JSON.stringify(payload) });
}

// Full replacement — send every field, same shape as create.
export function updateProduct(productId: string, payload: CreateProductPayload) {
  return request<ProductDto>(`/products/${productId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updateStock(productId: string, stockQuantity: number) {
  return request<ProductDto>(`/products/${productId}/stock`, { method: "PATCH", body: JSON.stringify({ stockQuantity }) });
}

/**
 * Saves the product's full image gallery in the given order (first = cover). Each entry is either an
 * already-saved image URL (kept) or a new File (uploaded); anything not listed is removed.
 */
export async function setProductImages(productId: string, images: Array<string | File>) {
  const form = new FormData();
  let newIndex = 0;
  const layout = images.map((image) => {
    if (typeof image === "string") return image;
    form.append("images", image);
    return `new:${newIndex++}`;
  });
  form.append("layout", JSON.stringify(layout));
  const res = await fetch(`${API_URL}/products/${productId}/images`, {
    method: "PUT",
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
  /** One or more products. Several only for STOCK products at the same 3PL; DROPSHIP orders have one. */
  items: OrderItemInput[];
  threePlId?: string;
  orderDate?: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost?: number;
  supplierUrl?: string;
  /** PKR rates typed in by the admin; any currency left out uses the live rate. */
  exchangeRates?: ExchangeRates;
}

export type UpdateOrderPayload = Partial<CreateOrderPayload> & {
  /** Re-convert every amount with today's rates instead of the ones locked on the order. */
  recalculateRates?: boolean;
};

/** Current PKR rate per currency (flags an unreachable API / a rate that must be typed in). */
export function listExchangeRates() {
  return request<ExchangeRateDto[]>("/exchange-rates");
}

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

// --- Invoices ---
// Everyone can list/download their own; ADMIN / STAFF-with-canGenerateInvoices-or-canViewFinancials see the
// whole company's. Only ADMIN / STAFF-with-canGenerateInvoices create, delete and mark paid.
export function listInvoices(userId?: string) {
  return request<InvoiceDto[]>(`/invoices${userId ? `?userId=${userId}` : ""}`);
}

/** `invoiceId`: when editing, that invoice's own orders are included (and count as open). */
export function listInvoiceableOrders(userId: string, role: InvoiceRole, invoiceId?: string) {
  return request<InvoiceableOrderDto[]>(
    `/invoices/invoiceable-orders?userId=${userId}&role=${role}${invoiceId ? `&invoiceId=${invoiceId}` : ""}`,
  );
}

/** The wizard's Review step — a DRAFT PDF of the selection; nothing is saved. */
export function previewInvoice(draft: InvoiceDraftInput, invoiceId?: string) {
  return requestBlob(`/invoices/preview${invoiceId ? `?invoiceId=${invoiceId}` : ""}`, {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export function getInvoice(invoiceId: string) {
  return request<InvoiceDto>(`/invoices/${invoiceId}`);
}

/** Re-issues an UNPAID invoice from a new selection (same user, role and number). */
export function updateInvoice(invoiceId: string, draft: InvoiceDraftInput) {
  return request<InvoiceDto>(`/invoices/${invoiceId}`, { method: "PATCH", body: JSON.stringify(draft) });
}

export function createInvoice(draft: InvoiceDraftInput) {
  return request<InvoiceDto>("/invoices", { method: "POST", body: JSON.stringify(draft) });
}

export function downloadInvoicePdf(invoiceId: string) {
  return requestBlob(`/invoices/${invoiceId}/pdf`);
}

/** UNPAID invoices are deleted, PAID ones voided; either way their orders reopen. */
export function deleteInvoice(invoiceId: string) {
  return request<{ id: string; voided: boolean }>(`/invoices/${invoiceId}`, { method: "DELETE" });
}

export function markInvoicePaid(invoiceId: string) {
  return request<InvoiceDto>(`/invoices/${invoiceId}/mark-paid`, { method: "PATCH" });
}

// --- Invoice templates ---
// ADMIN / STAFF-with-canGenerateInvoices list them (to pick one in the wizard); only ADMIN manages them.
export function listInvoiceTemplates() {
  return request<InvoiceTemplatesDto>("/invoice-templates");
}

/** On a predefined template `name` and `layout` are ignored (they're fixed). */
export interface InvoiceTemplateInput {
  name: string;
  layout: InvoiceLayout;
  colors: InvoiceTemplateColors;
  watermark: InvoiceWatermark | null;
}

export function createInvoiceTemplate(input: InvoiceTemplateInput) {
  return request<InvoiceTemplateDto>("/invoice-templates", { method: "POST", body: JSON.stringify(input) });
}

export function updateInvoiceTemplate(id: string, input: InvoiceTemplateInput) {
  return request<InvoiceTemplateDto>(`/invoice-templates/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

/** Invoices already issued with it keep their frozen copy; a deleted default falls back to Classic. */
export function deleteInvoiceTemplate(id: string) {
  return request<{ id: string }>(`/invoice-templates/${id}`, { method: "DELETE" });
}

/** A predefined template back to its original colors, no own logo and no watermark. */
export function resetInvoiceTemplate(id: string) {
  return request<InvoiceTemplateDto>(`/invoice-templates/${id}/reset`, { method: "POST" });
}

export function setDefaultInvoiceTemplate(templateId: string) {
  return request<{ defaultTemplateId: string }>("/invoice-templates/default", {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

async function sendForm(path: string, form: FormData): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: authHeaders(), body: form, cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res;
}

/** PNG or JPEG (PNG keeps a transparent background). */
export async function uploadInvoiceTemplateLogo(id: string, logo: File) {
  const form = new FormData();
  form.append("logo", logo);
  return (await sendForm(`/invoice-templates/${id}/logo`, form)).json() as Promise<InvoiceTemplateDto>;
}

/** Back to the company logo. */
export function removeInvoiceTemplateLogo(id: string) {
  return request<InvoiceTemplateDto>(`/invoice-templates/${id}/logo`, { method: "DELETE" });
}

/**
 * The editor's live preview: a sample invoice drawn with unsaved settings. Logo: the company's when
 * `useCompanyLogo`, else `logo` (unsaved file), else the saved template's (`templateId`).
 */
export async function previewInvoiceTemplate(input: {
  layout: InvoiceLayout;
  colors: InvoiceTemplateColors;
  watermark: InvoiceWatermark | null;
  role: "ACCOUNT_HOLDER" | "STOCK_OWNER" | "THREE_PL";
  useCompanyLogo: boolean;
  logo?: File | null;
  templateId?: string;
}) {
  const form = new FormData();
  form.append("layout", input.layout);
  form.append("colors", JSON.stringify(input.colors));
  if (input.watermark) form.append("watermark", JSON.stringify(input.watermark));
  form.append("role", input.role);
  form.append("useCompanyLogo", String(input.useCompanyLogo));
  if (input.templateId) form.append("templateId", input.templateId);
  if (input.logo) form.append("logo", input.logo);
  return (await sendForm("/invoice-templates/preview", form)).blob();
}

// --- Subscription (ADMIN / STAFF-with-canManageUsers) ---
export function getSubscription() {
  return request<CompanySubscriptionDto>("/subscriptions/me");
}

export function listSubscriptionPlans() {
  return request<SubscriptionPlanDto[]>("/subscriptions/plans");
}

export function listBillingPeriods() {
  return request<BillingPeriodDto[]>("/subscriptions/billing-periods");
}

export function listSubscriptionPayments() {
  return request<SubscriptionPaymentDto[]>("/subscriptions/payments");
}

export async function submitSubscriptionPayment(planId: string, billingPeriodId: string, referenceNote: string, receipt: File) {
  const form = new FormData();
  form.append("planId", planId);
  form.append("billingPeriodId", billingPeriodId);
  if (referenceNote) form.append("referenceNote", referenceNote);
  form.append("receipt", receipt);

  const res = await fetch(`${API_URL}/subscriptions/payments`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<SubscriptionPaymentDto>;
}

/** Price of `plan` for `period`, as the backend computes it (PKR, 2 decimals). */
export function subscriptionPrice(plan: Pick<SubscriptionPlanDto, "pricePerMonth">, period: Pick<BillingPeriodDto, "months" | "discountPercent">) {
  const subtotal = Math.round(plan.pricePerMonth * period.months * 100) / 100;
  const total = Math.round(subtotal * (1 - period.discountPercent / 100) * 100) / 100;
  return { subtotal, total, perMonth: Math.round((total / period.months) * 100) / 100 };
}
