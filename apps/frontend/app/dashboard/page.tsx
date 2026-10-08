"use client";

import type { ProductDto } from "@ebay-order-management/shared";
import { Alert, Card, Result, Statistic, Tag } from "antd";
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
  StaffDashboard,
  StockOwnerDashboard,
  ThreePlDashboard,
  accountHolderDashboard,
  getStoredUser,
  getToken,
  listProducts,
  accountStatus,
  staffDashboard,
  stockOwnerDashboard,
  threePlDashboard,
  type UninvoicedCounts as UninvoicedCountsDto,
} from "@/lib/api";
import { pkr } from "@/lib/currency";
import StatusCounts from "@/components/StatusCounts";

const STATUS_OPTIONS = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  PROCESSING: "#3b82f6",
  SHIPPED: "#8b5cf6",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
  REFUNDED: "#6b7280",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card size="small" title={<span className="text-xs font-medium text-gray-500">{title}</span>}>
      <div className="h-52 w-full">{children}</div>
    </Card>
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


/** Not-yet-invoiced orders for this viewer (all time, unaffected by the filters below), per status. */
function UninvoicedCounts({ data, statuses = STATUS_OPTIONS }: { data: UninvoicedCountsDto; statuses?: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-2 text-sm font-medium text-slate-600">Not invoiced yet</div>
      <StatusCounts
        totalLabel="Total orders"
        total={data.total}
        statuses={data.noTracking === undefined ? statuses : [...statuses, "NO_TRACKING"]}
        counts={{ ...data.byStatus, NO_TRACKING: data.noTracking ?? 0 }}
        labels={{ NO_TRACKING: "No tracking #" }}
        colors={{ NO_TRACKING: "#ea580c" }}
      />
    </div>
  );
}

// Order lists live on the Orders page; the dashboard only shows totals, charts and the not-invoiced counts.
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

  const productById = new Map(products.map((p) => [p.id, p]));
  const isStaffViewer =
    user?.roles.includes("ADMIN" as never) ||
    user?.roles.includes("STAFF" as never) ||
    user?.roles.includes("SUPER_ADMIN" as never) ||
    user?.roles.includes("PLATFORM_STAFF" as never);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    const onError = (err: Error) => setError(err.message);
    accountStatus().then((s) => setBlocked(s.disabled)).catch(() => undefined);
    listProducts().then(setProducts).catch(() => undefined);
    if (user?.roles.includes("ACCOUNT_HOLDER" as never)) accountHolderDashboard().then(setAh).catch(onError);
    if (user?.roles.includes("STOCK_OWNER" as never)) stockOwnerDashboard().then(setSo).catch(onError);
    if (user?.roles.includes("THREE_PL" as never)) threePlDashboard().then(setTp).catch(onError);
    if (isStaffViewer) staffDashboard().then(setStaff).catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (blocked) {
    return (
      <>
        <Nav />
        <main className="ml-56 max-w-lg p-8">
          <Result
            status="warning"
            title="Account deactivated"
            subTitle="Your account has been deactivated by your company. Please contact your company admin to get access back."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {staff && (
          <section className="mt-6">
            <h2 className="text-lg font-medium">Company overview</h2>
            <p className="text-sm text-gray-500">
              {staff.orderCount} orders this cycle — total company profit {pkr(staff.totalCompanyProfit)}
            </p>
            <UninvoicedCounts data={staff.uninvoiced} />

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Card size="small" className="kpi-hero">
                <Statistic title="Company profit this cycle" value={staff.totalCompanyProfit} precision={2} prefix="Rs" />
              </Card>
              <Card size="small" className="kpi-mint">
                <Statistic title="Active users" value={staff.userStats.active} />
              </Card>
              <Card size="small" className="kpi-sky">
                <Statistic title="Disabled users" value={staff.userStats.disabled} />
              </Card>
              <Card size="small" className="kpi-lavender">
                <Statistic title="Invited (pending)" value={staff.userStats.invited} />
              </Card>
              <Card size="small">
                <Statistic title="Aging orders" value={staff.agingOrders.length} styles={{ content: { color: "#dc2626" } }} />
              </Card>
            </div>

            <Card size="small" className="mt-3" title={<span className="text-xs font-medium text-gray-500">Users per role</span>}>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(staff.userStats.byRole)
                  .filter(([, count]) => count > 0)
                  .map(([role, count]) => (
                    <Tag key={role}>
                      {role}: <span className="font-semibold">{count}</span>
                    </Tag>
                  ))}
              </div>
            </Card>

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

          </section>
        )}

        {ah && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">Account Holder</h2>
            <p className="text-sm text-gray-500">
              {ah.orderCount} orders this cycle — total profit {pkr(ah.totalProfit)}
            </p>
            <UninvoicedCounts data={ah.uninvoiced} />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChartCard title="Your payout per day">
                <DailyLineChart data={ah.payoutByDay} color="#10b981" valueLabel="PKR" />
              </ChartCard>
              <ChartCard title="Your orders per day">
                <DailyLineChart data={ah.ordersByDay} color="#3b82f6" valueLabel="orders" />
              </ChartCard>
            </div>
          </section>
        )}

        {so && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">Stock Owner</h2>
            <p className="text-sm text-gray-500">
              {so.itemsSold} items sold this cycle — total profit {pkr(so.totalProfit)}
            </p>
            <UninvoicedCounts data={so.uninvoiced} />
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
          </section>
        )}

        {tp && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">3PL</h2>
            <p className="text-sm text-gray-500">Earnings this cycle: {pkr(tp.totalEarnings)}</p>
            {/* 3PLs never see PENDING orders. */}
            <UninvoicedCounts data={tp.uninvoiced} statuses={STATUS_OPTIONS.filter((st) => st !== "PENDING")} />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2">
              <ChartCard title="Orders fulfilled per day">
                <DailyLineChart data={tp.fulfilledByDay} color="#8b5cf6" valueLabel="orders" />
              </ChartCard>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
