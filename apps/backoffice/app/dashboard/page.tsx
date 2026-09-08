"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, staffDashboard } from "@/lib/api";

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

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        {!data && !error && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

        {data && (
          <>
            <p className="mt-2 text-sm text-gray-500">
              Cycle: {new Date(data.cycleStart).toLocaleDateString()} – {new Date(data.cycleEnd).toLocaleDateString()}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded border bg-white p-4">
                <p className="text-sm text-gray-500">Total company profit</p>
                <p className="text-2xl font-semibold">${data.totalCompanyProfit.toFixed(2)}</p>
              </div>
              <div className="rounded border bg-white p-4">
                <p className="text-sm text-gray-500">Orders this cycle</p>
                <p className="text-2xl font-semibold">{data.orderCount}</p>
              </div>
              {Object.entries(data.ordersByStatus)
                .filter(([, count]) => count > 0)
                .slice(0, 2)
                .map(([status, count]) => (
                  <div key={status} className="rounded border bg-white p-4">
                    <p className="text-sm text-gray-500">{STATUS_LABELS[status] ?? status}</p>
                    <p className="text-2xl font-semibold">{count}</p>
                  </div>
                ))}
            </div>

            <h2 className="mt-8 text-lg font-medium">Orders by status</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {Object.entries(data.ordersByStatus).map(([status, count]) => (
                <div key={status} className="rounded border bg-white px-4 py-2 text-sm">
                  <span className="text-gray-500">{STATUS_LABELS[status] ?? status}: </span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>

            <h2 className="mt-8 text-lg font-medium">Cumulative profit this cycle</h2>
            <ProfitChart series={data.profitSeries} />

            <h2 className="mt-8 text-lg font-medium">Orders per user, by status</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">User</th>
                    <th className="py-2">Role</th>
                    {Object.keys(STATUS_LABELS).map((s) => (
                      <th key={s} className="py-2 text-right">
                        {STATUS_LABELS[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.ordersPerUser.map((row) => (
                    <tr key={`${row.userId}:${row.role}`} className="border-b">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-gray-500">{ROLE_LABELS[row.role] ?? row.role}</td>
                      {Object.keys(STATUS_LABELS).map((s) => (
                        <td key={s} className="py-2 text-right">
                          {row.byStatus[s] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {data.ordersPerUser.length === 0 && (
                    <tr>
                      <td colSpan={2 + Object.keys(STATUS_LABELS).length} className="py-4 text-gray-500">
                        No orders yet this cycle.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="mt-8 text-lg font-medium">Sales by Account Holder</h2>
            <table className="mt-4 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Account Holder</th>
                  <th className="py-2">Orders</th>
                  <th className="py-2">Company Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.salesByAccountHolder.map((row) => (
                  <tr key={row.accountHolderId} className="border-b">
                    <td className="py-2">{row.name}</td>
                    <td className="py-2">{row.orderCount}</td>
                    <td className="py-2">${row.profit.toFixed(2)}</td>
                  </tr>
                ))}
                {data.salesByAccountHolder.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-gray-500">
                      No orders yet this cycle.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </main>
    </>
  );
}

function ProfitChart({ series }: { series: DashboardData["profitSeries"] }) {
  if (series.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">No data yet this cycle.</p>;
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
    <div className="mt-3 rounded border bg-white p-4">
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
    </div>
  );
}
