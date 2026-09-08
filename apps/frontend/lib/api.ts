import type {
  AccountHolderProfileDto,
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

export function login(email: string, password: string) {
  return request<{ accessToken: string; user: StoredUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, context: "portal" }),
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

export interface AccountHolderDashboard {
  cycleStart: string;
  cycleEnd: string;
  orderCount: number;
  totalProfit: number;
  orders: { orderId: string; ebayOrderRef: string; status: string; profit: number; payout: number }[];
}

export function accountHolderDashboard() {
  return request<AccountHolderDashboard>("/dashboard/account-holder");
}

export interface StockOwnerDashboard {
  cycleStart: string;
  cycleEnd: string;
  itemsSold: number;
  totalProfit: number;
  orders: { orderId: string; ebayOrderRef: string; status: string; quantity: number; net: number }[];
}

export function stockOwnerDashboard() {
  return request<StockOwnerDashboard>("/dashboard/stock-owner");
}

export interface ThreePlDashboard {
  cycleStart: string;
  cycleEnd: string;
  totalEarnings: number;
  toProcess: { orderId: string; ebayOrderRef: string; status: string }[];
  fulfilled: { orderId: string; ebayOrderRef: string; status: string }[];
}

export function threePlDashboard() {
  return request<ThreePlDashboard>("/dashboard/three-pl");
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
  return request<{ id: string; name: string; logoUrl: string | null; emailVerifiedAt: string | null }>("/companies/me");
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
  threePlProfile?: Pick<ThreePlProfileDto, "payoutPerOrder" | "billingCycleStartDay">;
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

// --- Products (company self-management: ADMIN/STAFF-with-canManageStock) ---
export function listProducts() {
  return request<ProductDto[]>("/products");
}

export interface CreateProductPayload {
  stockOwnerId: string;
  fulfillmentType: ProductFulfillmentType;
  threePlId?: string;
  sku: string;
  title: string;
  stockOwnerCost: number;
  buyPrice: number;
  sellPrice: number;
  stockQuantity: number;
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
}

export type UpdateOrderPayload = Partial<Omit<CreateOrderPayload, "quantity" | "threePlId" | "productId">>;

export function createOrder(payload: CreateOrderPayload) {
  return request<OrderDto>("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export function updateOrder(orderId: string, payload: UpdateOrderPayload) {
  return request<OrderDto>(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(payload) });
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
