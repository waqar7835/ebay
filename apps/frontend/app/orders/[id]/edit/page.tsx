"use client";

import type { OrderDto, ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, listOrders, listProducts, listUsers, mediaUrl, updateOrder, uploadOrderShippingLabel } from "@/lib/api";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const emptyForm = {
  accountHolderId: "",
  orderDate: "",
  ebayOrderRef: "",
  trackingNumber: "",
  buyerDetails: "",
  ebayNetProceeds: "0",
  shippingCost: "0",
  supplierUrl: "",
};

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDto | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [shippingLabel, setShippingLabel] = useState<File | null>(null);

  function setField<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers as never).catch(() => undefined);
    listOrders()
      .then((orders) => {
        const found = orders.find((o) => o.id === orderId);
        if (!found) {
          setLoadError("Order not found");
          return;
        }
        setOrder(found);
        setForm({
          accountHolderId: found.accountHolderId,
          orderDate: found.orderDate,
          ebayOrderRef: found.ebayOrderRef,
          trackingNumber: found.trackingNumber ?? "",
          buyerDetails: found.buyerDetails,
          ebayNetProceeds: String(found.ebayNetProceeds),
          shippingCost: String(found.shippingCost),
          supplierUrl: found.supplierUrl ?? "",
        });
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load order"));
  }, [router, orderId]);

  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const product = order ? products.find((p) => p.id === order.productId) : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await updateOrder(orderId, {
        accountHolderId: form.accountHolderId,
        orderDate: form.orderDate,
        ebayOrderRef: form.ebayOrderRef,
        trackingNumber: form.trackingNumber || undefined,
        buyerDetails: form.buyerDetails,
        ebayNetProceeds: Number(form.ebayNetProceeds),
        shippingCost: Number(form.shippingCost),
        supplierUrl: form.supplierUrl || undefined,
      });
      if (shippingLabel) {
        await uploadOrderShippingLabel(orderId, shippingLabel);
      }
      router.push("/orders");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save order");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit order</h1>
          <button onClick={() => router.push("/orders")} className="rounded border px-3 py-2 text-sm">
            Back to orders
          </button>
        </div>

        {loadError && <p className="mt-4 text-red-600">{loadError}</p>}

        {order && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border bg-white p-4 text-sm">
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
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3 rounded bg-gray-50 p-3">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded border bg-white">
                {product?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(product.imageUrl)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">—</span>
                )}
              </div>
              <p className="text-gray-600">
                {product ? `${product.sku} — ${product.title}` : "—"} · Qty {order.quantity}
              </p>
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

            <label>
              Supplier/product listing URL (optional)
              <input
                placeholder="https://…"
                value={form.supplierUrl}
                onChange={(e) => setField("supplierUrl", e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>

            <label>
              Shipping label (PDF)
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setShippingLabel(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm"
              />
              {order.shippingLabelUrl && (
                <a
                  href={mediaUrl(order.shippingLabelUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-blue-600 underline"
                >
                  View current shipping label
                </a>
              )}
            </label>

            {formError && <p className="text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 self-start rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-70"
            >
              {submitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
