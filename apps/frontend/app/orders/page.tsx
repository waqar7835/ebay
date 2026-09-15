"use client";

import type { OrderDto, OrderStatus, ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { API_URL, getToken, listOrders, listProducts, updateOrderStatus } from "@/lib/api";

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

const SOURCE_LABEL: Record<string, string> = {
  STOCK: "Stock",
  DROPSHIP: "AliExpress",
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);

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
  }, [router]);

  const productById = new Map(products.map((p) => [p.id, p]));

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
          <button onClick={() => router.push("/orders/new")} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            New order
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

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
                    <button onClick={() => router.push(`/orders/${order.id}/edit`)} className="rounded border px-2 py-1 text-xs">
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
