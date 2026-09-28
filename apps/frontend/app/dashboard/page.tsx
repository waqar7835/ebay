"use client";

import type { OrderStatus, ProductDto } from "@ebay-order-management/shared";
import { PrinterOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Result, Select, Statistic, Table, Tag, Tooltip as AntTooltip } from "antd";
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
import DateField from "@/components/DateField";
import ProductThumb from "@/components/ProductThumb";
import {
  AccountHolderDashboard,
  DailyPoint,
  DashboardOrderFilters,
  DashboardOrderItem,
  StaffDashboard,
  StockOwnerDashboard,
  ThreePlDashboard,
  ThreePlOrderRow,
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
    <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
      <label>
        Status
        <Select
          allowClear
          placeholder="All"
          value={value.status || undefined}
          onChange={(v) => onChange({ ...value, status: v ?? "" })}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          className="mt-1 flex w-36"
        />
      </label>
      <label>
        Start date
        <DateField value={value.startDate} onChange={(v) => onChange({ ...value, startDate: v })} className="mt-1 flex" />
      </label>
      <label>
        End date
        <DateField value={value.endDate} onChange={(v) => onChange({ ...value, endDate: v })} className="mt-1 flex" />
      </label>
    </div>
  );
}

/** Every product on an order, each with a readable thumbnail (click to preview) and its quantity when there are several. */
function ProductsCell({ items, productById }: { items: DashboardOrderItem[]; productById: Map<string, ProductDto> }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const product = productById.get(item.productId);
        return (
          <div key={item.productId} className="flex items-center gap-3">
            <ProductThumb product={product} size={44} />
            <span>
              {product?.title ?? "—"}
              {items.length > 1 && <span className="text-slate-500"> ×{item.quantity}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

function StaleBadge({ daysInStatus }: { daysInStatus: number }) {
  return (
    <AntTooltip title={`In this status for ${daysInStatus} days`}>
      <Tag color="red" className="ml-2">
        ⚠ {daysInStatus}d
      </Tag>
    </AntTooltip>
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

  const productColumn = {
    title: "Product",
    key: "product",
    render: (_: unknown, o: { items: DashboardOrderItem[] }) => <ProductsCell items={o.items} productById={productById} />,
  };
  const money = (v: number) => `$${v.toFixed(2)}`;

  if (blocked) {
    return (
      <>
        <Nav />
        <main className="ml-56 max-w-lg p-8">
          <Result
            status="warning"
            title="Access pending payment"
            subTitle="Your seat's payment is overdue. Please contact your company admin to submit payment — your dashboard will unlock once it's approved."
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
              {staff.orderCount} orders this cycle — total company profit ${staff.totalCompanyProfit.toFixed(2)}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Card size="small" className="kpi-hero">
                <Statistic title="Company profit this cycle" value={staff.totalCompanyProfit} precision={2} prefix="$" />
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

            {staff.agingOrders.length > 0 && (
              <Card
                size="small"
                className="mt-3 border-red-200 bg-red-50"
                title={<span className="text-xs font-medium text-red-700">Orders stuck in status for {staff.staleOrderDays}+ days</span>}
              >
                <Table
                  rowKey="orderId"
                  size="small"
                  pagination={false}
                  dataSource={staff.agingOrders}
                  columns={[
                    { title: "Order", dataIndex: "ebayOrderRef" },
                    { title: "Status", dataIndex: "status" },
                    { title: "Days", dataIndex: "daysInStatus", render: (v: number) => <span className="font-medium text-red-700">{v}</span> },
                    { title: "Account Holder", dataIndex: "accountHolderName" },
                    { title: "Stock Owner", dataIndex: "stockOwnerName", render: (v: string | null) => v ?? "—" },
                    { title: "3PL", dataIndex: "threePlName", render: (v: string | null) => v ?? "—" },
                  ]}
                />
              </Card>
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
            <Table
              className="mt-2"
              rowKey="orderId"
              size="small"
              pagination={false}
              dataSource={ah.orders}
              locale={{ emptyText: "No orders in this range." }}
              columns={[
                { title: "Order", dataIndex: "ebayOrderRef" },
                productColumn,
                { title: "Qty", dataIndex: "quantity" },
                { title: "Status", dataIndex: "status" },
                { title: "Profit", dataIndex: "profit", render: money },
                { title: "Your payout", dataIndex: "payout", render: money },
              ]}
            />
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
            <Table
              className="mt-2"
              rowKey="orderId"
              size="small"
              pagination={false}
              dataSource={so.orders}
              locale={{ emptyText: "No orders in this range." }}
              columns={[
                { title: "Order", dataIndex: "ebayOrderRef" },
                productColumn,
                { title: "Status", dataIndex: "status" },
                { title: "Qty", dataIndex: "quantity" },
                { title: "Your net", dataIndex: "net", render: money },
              ]}
            />
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
            <Table<ThreePlOrderRow>
              className="mt-2"
              rowKey="orderId"
              size="small"
              pagination={false}
              dataSource={tp.toProcess}
              locale={{ emptyText: "Nothing to process." }}
              columns={[
                { title: "Order", dataIndex: "ebayOrderRef" },
                productColumn,
                { title: "Qty", dataIndex: "quantity" },
                {
                  title: "Status",
                  key: "status",
                  render: (_, o) => (
                    <>
                      {o.status}
                      {o.stale && <StaleBadge daysInStatus={o.daysInStatus} />}
                    </>
                  ),
                },
                {
                  key: "advance",
                  render: (_, o) =>
                    o.status === "PENDING" ? (
                      <Button size="small" onClick={() => advanceThreePl(o.orderId, "PROCESSING" as OrderStatus)}>
                        Start processing
                      </Button>
                    ) : o.status === "PROCESSING" ? (
                      <Button size="small" onClick={() => advanceThreePl(o.orderId, "SHIPPED" as OrderStatus)}>
                        Mark shipped
                      </Button>
                    ) : null,
                },
                {
                  key: "label",
                  render: (_, o) =>
                    o.status === "PROCESSING" &&
                    o.shippingLabelUrl && (
                      <Button
                        size="small"
                        icon={<PrinterOutlined />}
                        onClick={() => printLabel(o.shippingLabelUrl as string)}
                        title="Print shipping label"
                      >
                        Print
                      </Button>
                    ),
                },
              ]}
            />

            <h3 className="mt-4 font-medium">Fulfilled this cycle</h3>
            <Table<ThreePlOrderRow>
              className="mt-2"
              rowKey="orderId"
              size="small"
              pagination={false}
              showHeader={false}
              dataSource={tp.fulfilled}
              locale={{ emptyText: "Nothing fulfilled in this range." }}
              columns={[
                { title: "Order", dataIndex: "ebayOrderRef" },
                productColumn,
                { title: "Qty", dataIndex: "quantity" },
                { title: "Status", dataIndex: "status" },
              ]}
            />
          </section>
        )}
      </main>
    </>
  );
}
