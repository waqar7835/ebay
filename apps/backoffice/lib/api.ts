import type {
  AccountHolderProfileDto,
  BackofficePermissionsDto,
  BackofficeUserDto,
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${withSelectedCompany(path)}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
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
  return request<{ id: string; name: string; logoUrl: string | null; emailVerifiedAt: string | null }>("/companies/me");
}

// --- Users ---
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

export function setUserStatus(userId: string, enable: boolean) {
  return request<UserDto>(`/users/${userId}/${enable ? "enable" : "disable"}`, { method: "PATCH" });
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

export async function uploadProductImage(productId: string, image: File) {
  const form = new FormData();
  form.append("image", image);
  const res = await fetch(`${API_URL}${withSelectedCompany(`/products/${productId}/image`)}`, {
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

// --- Orders ---
export function listOrders() {
  return request<OrderDto[]>("/orders");
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

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return request<OrderDto>(`/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// --- Invoices ---
export function listInvoices(userId?: string) {
  return request<InvoiceDto[]>(`/invoices${userId ? `?userId=${userId}` : ""}`);
}

export function generateInvoice(userId: string, role: Role) {
  return request<InvoiceDto>("/invoices/generate", { method: "POST", body: JSON.stringify({ userId, role }) });
}

export function markInvoicePaid(invoiceId: string) {
  return request<InvoiceDto>(`/invoices/${invoiceId}/mark-paid`, { method: "PATCH" });
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

// --- Billing (seat payments) ---
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

  const res = await fetch(`${API_URL}${withSelectedCompany("/billing/seat-orders")}`, {
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

// --- Super Admin ---
export function listPendingSeatOrders() {
  return request<unknown[]>("/billing/seat-orders/pending");
}

export function reviewSeatOrder(orderId: string, approve: boolean) {
  return request<unknown>(`/billing/seat-orders/${orderId}/review`, {
    method: "PATCH",
    body: JSON.stringify({ approve }),
  });
}

export function listAllCompanies() {
  return request<{ id: string; name: string; emailVerifiedAt: string | null; createdAt: string }[]>("/companies");
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
