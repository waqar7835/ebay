"use client";

import type { OrderDto, OrderStatus, ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  API_URL,
  createOrder,
  getToken,
  listOrders,
  listProducts,
  listUsers,
  updateOrder,
  updateOrderStatus,
} from "@/lib/api";

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

const SOURCE_LABEL: Record<string, string> = {
  STOCK: "Stock",
  DROPSHIP: "AliExpress",
};

interface UserOption {
  id: string;
  email: string;
  roles: string[];
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  accountHolderId: "",
  productId: "",
  quantity: "1",
  orderDate: todayIsoDate(),
  ebayOrderRef: "",
  trackingNumber: "",
  buyerDetails: "",
  ebayNetProceeds: "0",
  shippingCost: "0",
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);

  function setField<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function refresh() {
    listOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers as never).catch(() => undefined);
  }, [router]);

  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const productById = new Map(products.map((p) => [p.id, p]));

  function openCreateForm() {
    setEditingOrderId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(order: OrderDto) {
    setEditingOrderId(order.id);
    setForm({
      accountHolderId: order.accountHolderId,
      productId: order.productId,
      quantity: String(order.quantity),
      orderDate: order.orderDate,
      ebayOrderRef: order.ebayOrderRef,
      trackingNumber: order.trackingNumber ?? "",
      buyerDetails: order.buyerDetails,
      ebayNetProceeds: String(order.ebayNetProceeds),
      shippingCost: String(order.shippingCost),
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingOrderId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      if (editingOrderId) {
        await updateOrder(editingOrderId, {
          accountHolderId: form.accountHolderId,
          orderDate: form.orderDate,
          ebayOrderRef: form.ebayOrderRef,
          trackingNumber: form.trackingNumber || undefined,
          buyerDetails: form.buyerDetails,
          ebayNetProceeds: Number(form.ebayNetProceeds),
          shippingCost: Number(form.shippingCost),
        });
      } else {
        await createOrder({
          accountHolderId: form.accountHolderId,
          productId: form.productId,
          quantity: Number(form.quantity),
          orderDate: form.orderDate,
          ebayOrderRef: form.ebayOrderRef,
          trackingNumber: form.trackingNumber || undefined,
          buyerDetails: form.buyerDetails,
          ebayNetProceeds: Number(form.ebayNetProceeds),
          shippingCost: Number(form.shippingCost),
        });
      }
      closeForm();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save order");
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    await updateOrderStatus(orderId, status);
    refresh();
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-5xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Orders</h1>
          <button onClick={() => (showForm ? closeForm() : openCreateForm())} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            {showForm ? "Cancel" : "New order"}
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border bg-white p-4 text-sm">
            <h2 className="font-medium">{editingOrderId ? "Edit order" : "New order"}</h2>

            <div className="flex gap-3">
              <label className="w-40">
                Order date
                <input
                  type="date"
                  required
                  value={form.orderDate}
                  onChange={(e) => setField("orderDate", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="flex-1">
                Client (Account Holder)
                <select
                  required
                  value={form.accountHolderId}
                  onChange={(e) => setField("accountHolderId", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                >
                  <option value="">Select…</option>
                  {accountHolders.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex gap-3">
              <label className="flex-1">
                Product
                <select
                  required
                  disabled={!!editingOrderId}
                  value={form.productId}
                  onChange={(e) => setField("productId", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1 disabled:bg-gray-100"
                >
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-24">
                Qty
                <input
                  disabled={!!editingOrderId}
                  value={form.quantity}
                  onChange={(e) => setField("quantity", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1 disabled:bg-gray-100"
                />
              </label>
              {productById.get(form.productId)?.imageUrl && (
                <div className="mt-6 h-9 w-9 shrink-0 overflow-hidden rounded border bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_URL}${productById.get(form.productId)?.imageUrl}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <label className="flex-1">
                eBay order number
                <input
                  placeholder="eBay order number"
                  required
                  value={form.ebayOrderRef}
                  onChange={(e) => setField("ebayOrderRef", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="flex-1">
                Tracking number
                <input
                  placeholder="Tracking number"
                  value={form.trackingNumber}
                  onChange={(e) => setField("trackingNumber", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>

            <label>
              Buyer details (name, address, phone number)
              <textarea
                required
                rows={4}
                placeholder={"Name\nAddress\nPhone number"}
                value={form.buyerDetails}
                onChange={(e) => setField("buyerDetails", e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex-1">
                Payout (net profit from eBay)
                <input
                  value={form.ebayNetProceeds}
                  onChange={(e) => setField("ebayNetProceeds", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="flex-1">
                Shipping label cost (optional)
                <input
                  value={form.shippingCost}
                  onChange={(e) => setField("shippingCost", e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>

            {formError && <p className="text-red-600">{formError}</p>}
            <button type="submit" className="self-start rounded bg-gray-900 px-3 py-2 text-white">
              {editingOrderId ? "Save changes" : "Create order"}
            </button>
          </form>
        )}

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Image</th>
              <th className="py-2">SKU</th>
              <th className="py-2">Product</th>
              <th className="py-2">Source</th>
              <th className="py-2">Date</th>
              <th className="py-2">Order #</th>
              <th className="py-2">Tracking #</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Payout</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const product = productById.get(order.productId);
              return (
                <tr key={order.id} className="border-b align-top">
                  <td className="py-2">
                    <div className="h-10 w-10 overflow-hidden rounded border bg-gray-50">
                      {product?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${API_URL}${product.imageUrl}`} alt={product.title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">{product?.sku ?? "—"}</td>
                  <td className="py-2">{product?.title ?? "—"}</td>
                  <td className="py-2">{product ? (SOURCE_LABEL[product.fulfillmentType] ?? product.fulfillmentType) : "—"}</td>
                  <td className="py-2">{order.orderDate}</td>
                  <td className="py-2">{order.ebayOrderRef}</td>
                  <td className="py-2">{order.trackingNumber ?? "—"}</td>
                  <td className="py-2">{order.quantity}</td>
                  <td className="py-2">${order.ebayNetProceeds.toFixed(2)}</td>
                  <td className="py-2">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                      className="rounded border px-2 py-1"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <button onClick={() => openEditForm(order)} className="rounded border px-2 py-1 text-xs">
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={11} className="py-4 text-gray-500">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
