"use client";

import type { OrderStatus, ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Nav from "@/components/Nav";
import {
  AccountHolderDashboard,
  DailyPoint,
  DashboardOrderFilters,
  StaffDashboard,
  StockOwnerDashboard,
  ThreePlDashboard,
  accountHolderDashboard,
  getStoredUser,
  getToken,
  listProducts,
  mediaUrl,
  seatStatus,
  staffDashboard,
  stockOwnerDashboard,
  threePlDashboard,
  updateOrderStatus,
} from "@/lib/api";

const STATUS_OPTIONS: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  PROCESSING: "#3b82f6",
  SHIPPED: "#8b5cf6",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
  REFUNDED: "#6b7280",
};

interface FilterState {
  status: string;
  startDate: string;
  endDate: string;
}

const emptyFilter: FilterState = { status: "", startDate: "", endDate: "" };

function toQuery(f: FilterState): DashboardOrderFilters {
  return {
    status: (f.status || undefined) as OrderStatus | undefined,
    startDate: f.startDate || undefined,
    endDate: f.endDate || undefined,
  };
}

function FilterBar({ value, onChange }: { value: FilterState; onChange: (next: FilterState) => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
      <label>
        Status
        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
          className="mt-1 block rounded border px-2 py-1"
        >
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => (
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
          value={value.startDate}
          onChange={(e) => onChange({ ...value, startDate: e.target.value })}
          className="mt-1 block rounded border px-2 py-1"
        />
      </label>
      <label>
        End date
        <input
          type="date"
          value={value.endDate}
          onChange={(e) => onChange({ ...value, endDate: e.target.value })}
          className="mt-1 block rounded border px-2 py-1"
        />
      </label>
    </div>
  );
}

function ProductCell({ product }: { product: ProductDto | undefined }) {
  return (
    <td className="py-2">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded border bg-gray-50">
          {product?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(product.imageUrl)} alt={product.title} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[9px] text-gray-400">—</span>
          )}
        </div>
        <span>{product?.title ?? "—"}</span>
      </div>
    </td>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-white p-3">
      <p className="mb-2 text-xs font-medium text-gray-500">{title}</p>
      <div className="h-52 w-full">{children}</div>
    </div>
  );
}

function DailyLineChart({ data, color, valueLabel }: { data: DailyPoint[]; color: string; valueLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip formatter={(v) => [v, valueLabel] as [number, string]} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function NamedBarChart({ data, color, valueLabel }: { data: { name: string; value: number }[]; color: string; valueLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
        <Tooltip formatter={(v) => [v, valueLabel] as [number, string]} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatusPieChart({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ name: status, value: count }));
  if (rows.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-gray-400">No orders yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
          {rows.map((row) => (
            <Cell key={row.name} fill={STATUS_COLORS[row.name] ?? "#9ca3af"} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function StaleBadge({ daysInStatus }: { daysInStatus: number }) {
  return (
    <span
      title={`In this status for ${daysInStatus} days`}
      className="ml-2 inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
    >
      ⚠ {daysInStatus}d
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const user = getStoredUser();
  const [blocked, setBlocked] = useState(false);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [ah, setAh] = useState<AccountHolderDashboard | null>(null);
  const [so, setSo] = useState<StockOwnerDashboard | null>(null);
  const [tp, setTp] = useState<ThreePlDashboard | null>(null);
  const [staff, setStaff] = useState<StaffDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ahFilter, setAhFilter] = useState<FilterState>(emptyFilter);
  const [soFilter, setSoFilter] = useState<FilterState>(emptyFilter);
  const [tpFilter, setTpFilter] = useState<FilterState>(emptyFilter);
  const [ahInit, setAhInit] = useState(false);
  const [soInit, setSoInit] = useState(false);
  const [tpInit, setTpInit] = useState(false);

  const productById = new Map(products.map((p) => [p.id, p]));
  const isStaffViewer =
    user?.roles.includes("ADMIN" as never) ||
    user?.roles.includes("STAFF" as never) ||
    user?.roles.includes("SUPER_ADMIN" as never) ||
    user?.roles.includes("PLATFORM_STAFF" as never);

  function refreshAh(filter: FilterState) {
    if (!user?.roles.includes("ACCOUNT_HOLDER" as never)) return;
    accountHolderDashboard(toQuery(filter))
      .then((data) => {
        setAh(data);
        if (!ahInit) {
          setAhFilter({ status: filter.status, startDate: data.listStart, endDate: data.listEnd });
          setAhInit(true);
        }
      })
      .catch((err) => setError(err.message));
  }

  function refreshSo(filter: FilterState) {
    if (!user?.roles.includes("STOCK_OWNER" as never)) return;
    stockOwnerDashboard(toQuery(filter))
      .then((data) => {
        setSo(data);
        if (!soInit) {
          setSoFilter({ status: filter.status, startDate: data.listStart, endDate: data.listEnd });
          setSoInit(true);
        }
      })
      .catch((err) => setError(err.message));
  }

  function refreshTp(filter: FilterState) {
    if (!user?.roles.includes("THREE_PL" as never)) return;
    threePlDashboard(toQuery(filter))
      .then((data) => {
        setTp(data);
        if (!tpInit) {
          setTpFilter({ status: filter.status, startDate: data.listStart, endDate: data.listEnd });
          setTpInit(true);
        }
      })
      .catch((err) => setError(err.message));
  }

  function refreshStaff() {
    if (!isStaffViewer) return;
    staffDashboard()
      .then(setStaff)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    seatStatus().then((s) => setBlocked(s.blocked));
    listProducts().then(setProducts).catch(() => undefined);
    refreshAh(emptyFilter);
    refreshSo(emptyFilter);
    refreshTp(emptyFilter);
    refreshStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (ahInit) refreshAh(ahFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ahFilter.status, ahFilter.startDate, ahFilter.endDate]);

  useEffect(() => {
    if (soInit) refreshSo(soFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soFilter.status, soFilter.startDate, soFilter.endDate]);

  useEffect(() => {
    if (tpInit) refreshTp(tpFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpFilter.status, tpFilter.startDate, tpFilter.endDate]);

  async function advanceThreePl(orderId: string, next: OrderStatus) {
    await updateOrderStatus(orderId, next);
    refreshTp(tpFilter);
  }

  function printLabel(shippingLabelUrl: string) {
    const win = window.open(mediaUrl(shippingLabelUrl), "_blank");
    if (win) {
      setTimeout(() => win.print(), 500);
    }
  }

  if (blocked) {
    return (
      <>
        <Nav />
        <main className="ml-56 max-w-lg p-8 text-center">
          <h1 className="text-xl font-semibold">Access pending payment</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your seat's payment is overdue. Please contact your company admin to submit payment — your dashboard will
            unlock once it's approved.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-5xl p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {error && <p className="mt-4 text-red-600">{error}</p>}

        {staff && (
          <section className="mt-6">
            <h2 className="text-lg font-medium">Company overview</h2>
            <p className="text-sm text-gray-500">
              {staff.orderCount} orders this cycle — total company profit ${staff.totalCompanyProfit.toFixed(2)}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border bg-white p-3">
                <p className="text-xs text-gray-500">Active users</p>
                <p className="text-xl font-semibold text-green-700">{staff.userStats.active}</p>
              </div>
              <div className="rounded border bg-white p-3">
                <p className="text-xs text-gray-500">Disabled users</p>
                <p className="text-xl font-semibold text-gray-500">{staff.userStats.disabled}</p>
              </div>
              <div className="rounded border bg-white p-3">
                <p className="text-xs text-gray-500">Invited (pending)</p>
                <p className="text-xl font-semibold text-amber-600">{staff.userStats.invited}</p>
              </div>
              <div className="rounded border bg-white p-3">
                <p className="text-xs text-gray-500">Aging orders</p>
                <p className="text-xl font-semibold text-red-600">{staff.agingOrders.length}</p>
              </div>
            </div>

            <div className="mt-3 rounded border bg-white p-3">
              <p className="mb-2 text-xs font-medium text-gray-500">Users per role</p>
              <div className="flex flex-wrap gap-4 text-xs">
                {Object.entries(staff.userStats.byRole)
                  .filter(([, count]) => count > 0)
                  .map(([role, count]) => (
                    <span key={role} className="rounded bg-gray-100 px-2 py-1">
                      {role}: <span className="font-semibold">{count}</span>
                    </span>
                  ))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChartCard title="Orders per day this cycle">
                <DailyLineChart data={staff.ordersPerDay} color="#3b82f6" valueLabel="orders" />
              </ChartCard>
              <ChartCard title="Orders by status">
                <StatusPieChart data={staff.ordersByStatus} />
              </ChartCard>
              <ChartCard title="Orders per account holder this cycle">
                <NamedBarChart
                  data={staff.salesByAccountHolder.map((r) => ({ name: r.name, value: r.orderCount }))}
                  color="#8b5cf6"
                  valueLabel="orders"
                />
              </ChartCard>
              <ChartCard title="Products per stock owner">
                <NamedBarChart
                  data={staff.productsPerStockOwner.map((r) => ({ name: r.name, value: r.productCount }))}
                  color="#10b981"
                  valueLabel="products"
                />
              </ChartCard>
            </div>

            {staff.agingOrders.length > 0 && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 p-3">
                <p className="mb-2 text-xs font-medium text-red-700">
                  Orders stuck in status for {staff.staleOrderDays}+ days
                </p>
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-red-200">
                      <th className="py-1">Order</th>
                      <th className="py-1">Status</th>
                      <th className="py-1">Days</th>
                      <th className="py-1">Account Holder</th>
                      <th className="py-1">Stock Owner</th>
                      <th className="py-1">3PL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.agingOrders.map((o) => (
                      <tr key={o.orderId} className="border-b border-red-100">
                        <td className="py-1">{o.ebayOrderRef}</td>
                        <td className="py-1">{o.status}</td>
                        <td className="py-1 font-medium text-red-700">{o.daysInStatus}</td>
                        <td className="py-1">{o.accountHolderName}</td>
                        <td className="py-1">{o.stockOwnerName}</td>
                        <td className="py-1">{o.threePlName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {ah && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">Account Holder</h2>
            <p className="text-sm text-gray-500">
              {ah.orderCount} orders this cycle — total profit ${ah.totalProfit.toFixed(2)}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChartCard title="Your payout per day">
                <DailyLineChart data={ah.payoutByDay} color="#10b981" valueLabel="$" />
              </ChartCard>
              <ChartCard title="Your orders per day">
                <DailyLineChart data={ah.ordersByDay} color="#3b82f6" valueLabel="orders" />
              </ChartCard>
            </div>
            <FilterBar value={ahFilter} onChange={setAhFilter} />
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Order</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Profit</th>
                  <th className="py-2">Your payout</th>
                </tr>
              </thead>
              <tbody>
                {ah.orders.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <ProductCell product={productById.get(o.productId)} />
                    <td className="py-2">{o.quantity}</td>
                    <td className="py-2">{o.status}</td>
                    <td className="py-2">${o.profit.toFixed(2)}</td>
                    <td className="py-2">${o.payout.toFixed(2)}</td>
                  </tr>
                ))}
                {ah.orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-gray-500">
                      No orders in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {so && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">Stock Owner</h2>
            <p className="text-sm text-gray-500">
              {so.itemsSold} items sold this cycle — total profit ${so.totalProfit.toFixed(2)}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChartCard title="Items sold per day">
                <DailyLineChart data={so.itemsSoldByDay} color="#f59e0b" valueLabel="items" />
              </ChartCard>
              <ChartCard title="Units sold by product">
                <NamedBarChart
                  data={so.byProduct.map((p) => ({ name: productById.get(p.productId)?.title ?? p.productId, value: p.quantity }))}
                  color="#f59e0b"
                  valueLabel="units"
                />
              </ChartCard>
            </div>
            <FilterBar value={soFilter} onChange={setSoFilter} />
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Order</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Your net</th>
                </tr>
              </thead>
              <tbody>
                {so.orders.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <ProductCell product={productById.get(o.productId)} />
                    <td className="py-2">{o.status}</td>
                    <td className="py-2">{o.quantity}</td>
                    <td className="py-2">${o.net.toFixed(2)}</td>
                  </tr>
                ))}
                {so.orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-gray-500">
                      No orders in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {tp && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">3PL</h2>
            <p className="text-sm text-gray-500">Earnings this cycle: ${tp.totalEarnings.toFixed(2)}</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2">
              <ChartCard title="Orders fulfilled per day">
                <DailyLineChart data={tp.fulfilledByDay} color="#8b5cf6" valueLabel="orders" />
              </ChartCard>
            </div>
            <FilterBar value={tpFilter} onChange={setTpFilter} />

            <h3 className="mt-4 font-medium">Needs processing</h3>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Order</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Status</th>
                  <th className="py-2"></th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tp.toProcess.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <ProductCell product={productById.get(o.productId)} />
                    <td className="py-2">{o.quantity}</td>
                    <td className="py-2">
                      {o.status}
                      {o.stale && <StaleBadge daysInStatus={o.daysInStatus} />}
                    </td>
                    <td className="py-2">
                      {o.status === "PENDING" && (
                        <button onClick={() => advanceThreePl(o.orderId, "PROCESSING" as OrderStatus)} className="text-xs underline">
                          Start processing
                        </button>
                      )}
                      {o.status === "PROCESSING" && (
                        <button onClick={() => advanceThreePl(o.orderId, "SHIPPED" as OrderStatus)} className="text-xs underline">
                          Mark shipped
                        </button>
                      )}
                    </td>
                    <td className="py-2">
                      {o.status === "PROCESSING" && o.shippingLabelUrl && (
                        <button
                          onClick={() => printLabel(o.shippingLabelUrl as string)}
                          title="Print shipping label"
                          className="rounded border px-2 py-1 text-xs"
                        >
                          🖨️ Print
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tp.toProcess.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-gray-500">
                      Nothing to process.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <h3 className="mt-4 font-medium">Fulfilled this cycle</h3>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <tbody>
                {tp.fulfilled.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <ProductCell product={productById.get(o.productId)} />
                    <td className="py-2">{o.quantity}</td>
                    <td className="py-2">{o.status}</td>
                  </tr>
                ))}
                {tp.fulfilled.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-gray-500">
                      Nothing fulfilled in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
