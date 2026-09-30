"use client";

import { Alert, Card, Empty, Spin, Statistic, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, staffDashboard } from "@/lib/api";
import { pkr } from "@/lib/currency";

interface DashboardData {
  cycleStart: string;
  cycleEnd: string;
  totalCompanyProfit: number;
  orderCount: number;
  ordersByStatus: Record<string, number>;
  ordersPerUser: { userId: string; name: string; role: string; byStatus: Record<string, number> }[];
  profitSeries: { date: string; accountHolders: number; threePl: number; stockOwners: number }[];
  salesByAccountHolder: { accountHolderId: string; name: string; orderCount: number; profit: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

const ROLE_LABELS: Record<string, string> = {
  ACCOUNT_HOLDER: "Account Holder",
  STOCK_OWNER: "Stock Owner",
  THREE_PL: "3PL",
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    staffDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [router]);

  type PerUserRow = DashboardData["ordersPerUser"][number];
  type SalesRow = DashboardData["salesByAccountHolder"][number];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {!data && !error && <Spin className="mt-6 block" />}

        {data && (
          <>
            <p className="mt-2 text-sm text-gray-500">
              Cycle: {new Date(data.cycleStart).toLocaleDateString()} – {new Date(data.cycleEnd).toLocaleDateString()}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card size="small" className="kpi-hero">
                <Statistic title="Total company profit" value={data.totalCompanyProfit} precision={2} prefix="Rs" />
              </Card>
              <Card size="small" className="kpi-mint">
                <Statistic title="Orders this cycle" value={data.orderCount} />
              </Card>
              {Object.entries(data.ordersByStatus)
                .filter(([, count]) => count > 0)
                .slice(0, 2)
                .map(([status, count], i) => (
                  <Card key={status} size="small" className={i === 0 ? "kpi-sky" : "kpi-lavender"}>
                    <Statistic title={STATUS_LABELS[status] ?? status} value={count} />
                  </Card>
                ))}
            </div>

            <h2 className="mt-8 text-lg font-medium">Orders by status</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.ordersByStatus).map(([status, count]) => (
                <Tag key={status} className="px-3 py-1 text-sm">
                  <span className="text-gray-500">{STATUS_LABELS[status] ?? status}: </span>
                  <span className="font-semibold">{count}</span>
                </Tag>
              ))}
            </div>

            <h2 className="mt-8 text-lg font-medium">Cumulative profit this cycle</h2>
            <ProfitChart series={data.profitSeries} />

            <h2 className="mt-8 text-lg font-medium">Orders per user, by status</h2>
            <Table<PerUserRow>
              className="mt-4"
              rowKey={(row) => `${row.userId}:${row.role}`}
              size="small"
              pagination={false}
              scroll={{ x: 640 }}
              dataSource={data.ordersPerUser}
              locale={{ emptyText: "No orders yet this cycle." }}
              columns={[
                { title: "User", dataIndex: "name" },
                { title: "Role", dataIndex: "role", render: (r: string) => <span className="text-gray-500">{ROLE_LABELS[r] ?? r}</span> },
                ...Object.keys(STATUS_LABELS).map((s) => ({
                  title: STATUS_LABELS[s],
                  key: s,
                  align: "right" as const,
                  render: (_: unknown, row: PerUserRow) => row.byStatus[s] ?? 0,
                })),
              ]}
            />

            <h2 className="mt-8 text-lg font-medium">Sales by Account Holder</h2>
            <Table<SalesRow>
              className="mt-4"
              rowKey="accountHolderId"
              size="small"
              pagination={false}
              dataSource={data.salesByAccountHolder}
              locale={{ emptyText: "No orders yet this cycle." }}
              columns={[
                { title: "Account Holder", dataIndex: "name" },
                { title: "Orders", dataIndex: "orderCount" },
                { title: "Company Profit", dataIndex: "profit", render: (v: number) => pkr(v) },
              ]}
            />
          </>
        )}
      </main>
    </>
  );
}

function ProfitChart({ series }: { series: DashboardData["profitSeries"] }) {
  if (series.length === 0) {
    return <Empty className="mt-3" description="No data yet this cycle." />;
  }

  const max = Math.max(
    1,
    ...series.map((p) => Math.max(p.accountHolders, p.threePl, p.stockOwners)),
  );
  const width = 640;
  const height = 180;
  const stepX = series.length > 1 ? width / (series.length - 1) : 0;

  const toPoints = (key: "accountHolders" | "threePl" | "stockOwners") =>
    series.map((p, i) => `${i * stepX},${height - (p[key] / max) * height}`).join(" ");

  const lines: { key: "accountHolders" | "threePl" | "stockOwners"; color: string; label: string }[] = [
    { key: "accountHolders", color: "#2563eb", label: "Account Holders" },
    { key: "threePl", color: "#16a34a", label: "3PL" },
    { key: "stockOwners", color: "#d97706", label: "Stock Owners" },
  ];

  return (
    <Card size="small" className="mt-3">
      <div className="mb-3 flex gap-4 text-xs">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        {lines.map((l) => (
          <polyline key={l.key} fill="none" stroke={l.color} strokeWidth={2} points={toPoints(l.key)} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-gray-400">
        <span>{series[0].date}</span>
        <span>{series[series.length - 1].date}</span>
      </div>
    </Card>
  );
}
