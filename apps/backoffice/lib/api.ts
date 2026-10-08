import type {
  AccountHolderProfileDto,
  BackofficePermissionsDto,
  BillingPeriodDto,
  CompanySubscriptionDto,
  BackofficeUserDto,
  Currency,
  ExchangeRateDto,
  ExchangeRates,
  InvoiceDto,
  InvoiceTemplatesDto,
  OrderDto,
  OrderItemInput,
  OrderStatus,
  PlatformSettingsDto,
  PublicSiteDto,
  ProductDto,
  ProductFulfillmentType,
  Role,
  StaffPermissionsDto,
  StockOwnerProfileDto,
  SubscriptionPaymentDto,
  SubscriptionPaymentStatus,
  SubscriptionPlanDto,
  ThreePlProfileDto,
  UpdatePlatformSettingsInput,
  UserDto,
} from "@ebay-order-management/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Uploads are relative paths on local disk but absolute URLs when stored on R2.
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
  staffPermissions: BackofficePermissionsDto | null;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function getSelectedCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("selectedCompanyId");
}

export function setSelectedCompanyId(id: string) {
  localStorage.setItem("selectedCompanyId", id);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** For a Super Admin/Platform Staff with a company selected, tags every request with ?companyId=. No-op for everyone else. */
function withSelectedCompany(path: string): string {
  const user = getStoredUser();
  const companyId = getSelectedCompanyId();
  const isBackofficeRealm = user?.roles.includes("SUPER_ADMIN" as Role) || user?.roles.includes("PLATFORM_STAFF" as Role);
  if (!isBackofficeRealm || !companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${companyId}`;
}

/**
 * A readable message for a failed API response: the server's message (validation errors arrive as a list), or a plain
 * fallback by status — never a bare "Internal server error" / "Request failed: 500".
 */
function apiErrorMessage(status: number, body: { message?: unknown }): string {
  const raw = Array.isArray(body.message) ? body.message.join(". ") : typeof body.message === "string" ? body.message : "";
  if (raw && raw !== "Internal server error") return raw;
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You don't have permission to do this.";
  if (status === 404) return "This item no longer exists. Refresh the page and try again.";
  if (status === 409) return "This conflicts with existing data. Refresh the page and try again.";
  if (status === 413) return "The file is too large.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return "The request couldn't be completed. Please check the form and try again.";
}

/** fetch that turns a network failure (API down, offline) into a readable error. */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_URL}${withSelectedCompany(path)}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(res.status, body));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Auth ---
export function login(email: string, password: string) {
  return request<{ accessToken: string; user: StoredUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, context: "backoffice" }),
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

// --- Companies ---
export function getMyCompany() {
  return request<{ id: string; name: string; logoUrl: string | null; emailVerifiedAt: string | null; defaultCurrency: Currency }>(
    "/companies/me",
  );
}

// --- Users ---
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

export function setUserStatus(userId: string, enable: boolean) {
  return request<UserDto>(`/users/${userId}/${enable ? "enable" : "disable"}`, { method: "PATCH" });
}

export function deleteUser(userId: string) {
  return request<{ deleted: boolean }>(`/users/${userId}`, { method: "DELETE" });
}

export function updateStaffPermissions(userId: string, dto: StaffPermissionsDto) {
  return request<unknown>(`/users/${userId}/staff-permissions`, { method: "PATCH", body: JSON.stringify(dto) });
}

// --- Products ---
export function listProducts() {
  return request<ProductDto[]>("/products");
}

export interface CreateProductPayload {
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
  const res = await apiFetch(`${API_URL}${withSelectedCompany(`/products/${productId}/images`)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(res.status, body));
  }
  return res.json() as Promise<ProductDto>;
}

// --- Orders ---
export function listOrders() {
  return request<OrderDto[]>("/orders");
}

export interface CreateOrderPayload {
  accountHolderId: string;
  /** One or more products: all STOCK (at the same 3PL) or all DROPSHIP (each with an optional buy total). */
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

export type UpdateOrderPayload = Omit<Partial<CreateOrderPayload>, "threePlId"> & {
  /** Null removes a dropship order's 3PL. */
  threePlId?: string | null;
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

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return request<OrderDto>(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// --- Invoice templates (read-only here: the company Admin manages them in the portal) ---
export function listInvoiceTemplates() {
  return request<InvoiceTemplatesDto>("/invoice-templates");
}

// --- Invoices (read-only here: creating/deleting/paying is the company Admin's job in the portal) ---
export function listInvoices(userId?: string) {
  return request<InvoiceDto[]>(`/invoices${userId ? `?userId=${userId}` : ""}`);
}

export async function downloadInvoicePdf(invoiceId: string): Promise<Blob> {
  const res = await apiFetch(`${API_URL}${withSelectedCompany(`/invoices/${invoiceId}/pdf`)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(res.status, body));
  }
  return res.blob();
}

// --- Dashboard ---
export function staffDashboard() {
  return request<{
    cycleStart: string;
    cycleEnd: string;
    totalCompanyProfit: number;
    orderCount: number;
    ordersByStatus: Record<string, number>;
    ordersPerUser: { userId: string; name: string; role: string; byStatus: Record<string, number> }[];
    profitSeries: { date: string; accountHolders: number; threePl: number; stockOwners: number }[];
    salesByAccountHolder: { accountHolderId: string; name: string; orderCount: number; profit: number }[];
  }>("/dashboard/staff");
}

// --- Subscriptions (plans + billing periods: Super Admin edits; payments: Super Admin reviews) ---
// These are platform-wide, so they bypass withSelectedCompany() via rawRequest().
async function rawRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(res.status, body));
  }
  return res.json();
}

export type PlanInput = Omit<SubscriptionPlanDto, "id" | "isFree">;
export type BillingPeriodInput = Omit<BillingPeriodDto, "id">;

export function listSubscriptionPlans() {
  return rawRequest<SubscriptionPlanDto[]>("/subscriptions/plans?all=true");
}

export function createSubscriptionPlan(input: PlanInput) {
  return rawRequest<SubscriptionPlanDto>("/subscriptions/plans", { method: "POST", body: JSON.stringify(input) });
}

export function updateSubscriptionPlan(id: string, input: Partial<PlanInput>) {
  return rawRequest<SubscriptionPlanDto>(`/subscriptions/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteSubscriptionPlan(id: string) {
  return rawRequest<unknown>(`/subscriptions/plans/${id}`, { method: "DELETE" });
}

export function listBillingPeriods() {
  return rawRequest<BillingPeriodDto[]>("/subscriptions/billing-periods?all=true");
}

export function createBillingPeriod(input: BillingPeriodInput) {
  return rawRequest<BillingPeriodDto>("/subscriptions/billing-periods", { method: "POST", body: JSON.stringify(input) });
}

export function updateBillingPeriod(id: string, input: Partial<BillingPeriodInput>) {
  return rawRequest<BillingPeriodDto>(`/subscriptions/billing-periods/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteBillingPeriod(id: string) {
  return rawRequest<unknown>(`/subscriptions/billing-periods/${id}`, { method: "DELETE" });
}

export function listSubscriptionPayments(status?: SubscriptionPaymentStatus) {
  return rawRequest<SubscriptionPaymentDto[]>(`/subscriptions/payments/all${status ? `?status=${status}` : ""}`);
}

export function reviewSubscriptionPayment(id: string, approve: boolean) {
  return rawRequest<SubscriptionPaymentDto>(`/subscriptions/payments/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ approve }),
  });
}

export function getCompanySubscription(companyId: string) {
  return rawRequest<CompanySubscriptionDto>(`/subscriptions/me?companyId=${companyId}`);
}

export function assignSubscriptionPlan(companyId: string, planId: string, endsAt?: string) {
  return rawRequest<CompanySubscriptionDto>(`/subscriptions/companies/${companyId}/assign`, {
    method: "POST",
    body: JSON.stringify({ planId, endsAt }),
  });
}

export function listAllCompanies() {
  return request<
    {
      id: string;
      name: string;
      emailVerifiedAt: string | null;
      createdAt: string;
      subscriptionEndsAt: string | null;
      subscriptionPlan: { id: string; name: string } | null;
    }[]
  >("/companies");
}

// --- Platform Staff (backoffice_users) ---
export function listBackofficeUsers() {
  return request<BackofficeUserDto[]>("/backoffice-users");
}

export function inviteBackofficeUser(payload: { name?: string; email: string; permissions: BackofficePermissionsDto }) {
  return request<BackofficeUserDto>("/backoffice-users/invite", { method: "POST", body: JSON.stringify(payload) });
}

export function setBackofficeUserStatus(id: string, enable: boolean) {
  return request<BackofficeUserDto>(`/backoffice-users/${id}/${enable ? "enable" : "disable"}`, { method: "PATCH" });
}

export function updateBackofficeStaffPermissions(id: string, dto: BackofficePermissionsDto) {
  return request<unknown>(`/backoffice-users/${id}/permissions`, { method: "PATCH", body: JSON.stringify(dto) });
}

// --- Platform settings (Super Admin) ---

/** Public brand settings (no auth); the sidebar uses the platform logo. */
export function getPublicSite() {
  return request<PublicSiteDto>("/public/site");
}

export function getPlatformSettings() {
  return request<PlatformSettingsDto>("/platform-settings");
}

export function updatePlatformSettings(input: UpdatePlatformSettingsInput) {
  return request<PlatformSettingsDto>("/platform-settings", { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadPlatformLogo(logo: File) {
  const form = new FormData();
  form.append("logo", logo);
  const res = await apiFetch(`${API_URL}/platform-settings/logo`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(res.status, body));
  }
  return res.json() as Promise<PlatformSettingsDto>;
}

export function removePlatformLogo() {
  return request<PlatformSettingsDto>("/platform-settings/logo", { method: "DELETE" });
}

export function sendTestEmail(to: string) {
  return request<{ message: string }>("/platform-settings/test-email", { method: "POST", body: JSON.stringify({ to }) });
}
