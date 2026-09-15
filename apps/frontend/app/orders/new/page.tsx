"use client";

import type { ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { API_URL, createOrder, getToken, listProducts, listUsers } from "@/lib/api";

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

export default function NewOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

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
  }, [router]);

  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const productById = new Map(products.map((p) => [p.id, p]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
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
          <h1 className="text-2xl font-semibold">New order</h1>
          <button onClick={() => router.push("/orders")} className="rounded border px-3 py-2 text-sm">
            Back to orders
          </button>
        </div>

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
                value={form.productId}
                onChange={(e) => setField("productId", e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
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
              <input value={form.quantity} onChange={(e) => setField("quantity", e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            {productById.get(form.productId)?.imageUrl && (
              <div className="mt-6 h-9 w-9 shrink-0 overflow-hidden rounded border bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API_URL}${productById.get(form.productId)?.imageUrl}`} alt="" className="h-full w-full object-cover" />
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
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 self-start rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-70"
          >
            {submitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {submitting ? "Creating..." : "Create order"}
          </button>
        </form>
      </main>
    </>
  );
}
