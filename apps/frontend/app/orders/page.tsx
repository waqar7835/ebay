"use client";

import { Role, type OrderDto, type OrderStatus, type ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  computeCurrentCycle,
  getMyCompany,
  getStoredUser,
  getToken,
  listOrders,
  listProducts,
  listUsers,
  mediaUrl,
  updateOrderStatus,
} from "@/lib/api";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

const SOURCE_LABEL: Record<string, string> = {
  STOCK: "Stock",
  DROPSHIP: "AliExpress",
};

function userLabel(u: UserOption | undefined) {
  if (!u) return "—";
  return u.name || u.email;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ accountHolderId: string; threePlId: string; status: string; startDate: string; endDate: string }>({
    accountHolderId: "",
    threePlId: "",
    status: "",
    startDate: "",
    endDate: "",
  });
  const [filterInit, setFilterInit] = useState(false);

  const currentUser = getStoredUser();
  const isThreePl = currentUser?.roles.includes(Role.THREE_PL) ?? false;
  const isManager =
    currentUser?.roles.includes(Role.ADMIN) ||
    currentUser?.roles.includes(Role.STAFF) ||
    currentUser?.roles.includes(Role.SUPER_ADMIN) ||
    currentUser?.roles.includes(Role.PLATFORM_STAFF) ||
    !!currentUser?.staffPermissions?.canManageOrders;

  function refresh(f = filter) {
    listOrders({
      accountHolderId: f.accountHolderId || undefined,
      threePlId: f.threePlId || undefined,
      status: (f.status || undefined) as OrderStatus | undefined,
      startDate: f.startDate || undefined,
      endDate: f.endDate || undefined,
    })
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers as never).catch(() => undefined);
    refresh(filter);

    if (isManager) {
      getMyCompany()
        .then((company) => {
          const cycle = computeCurrentCycle(company.billingAnchorDay);
          setFilter({ accountHolderId: "", threePlId: "", status: "", startDate: cycle.start, endDate: cycle.end });
          setFilterInit(true);
        })
        .catch(() => setFilterInit(true));
    } else {
      setFilterInit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (filterInit) refresh(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.accountHolderId, filter.threePlId, filter.status, filter.startDate, filter.endDate]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    await updateOrderStatus(orderId, status);
    refresh();
  }

  function handlePrintLabel(shippingLabelUrl: string) {
    const win = window.open(mediaUrl(shippingLabelUrl), "_blank");
    if (win) {
      setTimeout(() => win.print(), 500);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Orders</h1>
          <button onClick={() => router.push("/orders/new")} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            New order
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded border bg-white p-3 text-xs">
          {isManager && (
            <>
              <label>
                Account Holder
                <select
                  value={filter.accountHolderId}
                  onChange={(e) => setFilter((f) => ({ ...f, accountHolderId: e.target.value }))}
                  className="mt-1 block rounded border px-2 py-1"
                >
                  <option value="">All</option>
                  {accountHolders.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                3PL
                <select
                  value={filter.threePlId}
                  onChange={(e) => setFilter((f) => ({ ...f, threePlId: e.target.value }))}
                  className="mt-1 block rounded border px-2 py-1"
                >
                  <option value="">All</option>
                  {threePls.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Status
            <select
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
              className="mt-1 block rounded border px-2 py-1"
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              value={filter.startDate}
              onChange={(e) => setFilter((f) => ({ ...f, startDate: e.target.value }))}
              className="mt-1 block rounded border px-2 py-1"
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={filter.endDate}
              onChange={(e) => setFilter((f) => ({ ...f, endDate: e.target.value }))}
              className="mt-1 block rounded border px-2 py-1"
            />
          </label>
        </div>

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Image</th>
              <th className="py-2">SKU</th>
              <th className="py-2">Product</th>
              <th className="py-2">Source</th>
              {isManager && <th className="py-2">Account Holder</th>}
              <th className="py-2">Date</th>
              <th className="py-2">Order #</th>
              <th className="py-2">Tracking #</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Payout</th>
              {isManager && <th className="py-2">Buy Price</th>}
              {isManager && <th className="py-2">3PL Fee</th>}
              {isManager && <th className="py-2">Profit</th>}
              <th className="py-2">Status</th>
              {isThreePl && <th className="py-2">Label</th>}
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
                        <img src={mediaUrl(product.imageUrl)} alt={product.title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">{product?.sku ?? "—"}</td>
                  <td className="py-2">{product?.title ?? "—"}</td>
                  <td className="py-2">{product ? (SOURCE_LABEL[product.fulfillmentType] ?? product.fulfillmentType) : "—"}</td>
                  {isManager && <td className="py-2">{userLabel(userById.get(order.accountHolderId))}</td>}
                  <td className="py-2">{order.orderDate}</td>
                  <td className="py-2">{order.ebayOrderRef}</td>
                  <td className="py-2">{order.trackingNumber ?? "—"}</td>
                  <td className="py-2">{order.quantity}</td>
                  <td className="py-2">${order.ebayNetProceeds.toFixed(2)}</td>
                  {isManager && <td className="py-2">${order.buyPriceSnapshot.toFixed(2)}</td>}
                  {isManager && (
                    <td className="py-2">
                      {order.threePlPayoutSnapshot != null ? `$${order.threePlPayoutSnapshot.toFixed(2)}` : "—"}
                    </td>
                  )}
                  {isManager && (
                    <td className="py-2">{order.companyProfit != null ? `$${order.companyProfit.toFixed(2)}` : "—"}</td>
                  )}
                  <td className="py-2">
                    <div className="flex items-center gap-2">
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
                      {isThreePl && order.stale && (
                        <span
                          title={`In this status for ${order.daysInStatus} days`}
                          className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                        >
                          ⚠ {order.daysInStatus}d
                        </span>
                      )}
                    </div>
                  </td>
                  {isThreePl && (
                    <td className="py-2">
                      {order.status === "PROCESSING" && order.shippingLabelUrl ? (
                        <button
                          onClick={() => handlePrintLabel(order.shippingLabelUrl as string)}
                          title="Print shipping label"
                          className="rounded border px-2 py-1 text-xs"
                        >
                          🖨️ Print
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
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
                <td colSpan={15} className="py-4 text-gray-500">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
