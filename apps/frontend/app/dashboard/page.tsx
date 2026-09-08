"use client";

import type { OrderStatus } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  AccountHolderDashboard,
  StockOwnerDashboard,
  ThreePlDashboard,
  accountHolderDashboard,
  getStoredUser,
  getToken,
  seatStatus,
  stockOwnerDashboard,
  threePlDashboard,
  updateOrderStatus,
} from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const user = getStoredUser();
  const [blocked, setBlocked] = useState(false);
  const [ah, setAh] = useState<AccountHolderDashboard | null>(null);
  const [so, setSo] = useState<StockOwnerDashboard | null>(null);
  const [tp, setTp] = useState<ThreePlDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!user) return;
    if (user.roles.includes("ACCOUNT_HOLDER" as never)) {
      accountHolderDashboard().then(setAh).catch((err) => setError(err.message));
    }
    if (user.roles.includes("STOCK_OWNER" as never)) {
      stockOwnerDashboard().then(setSo).catch((err) => setError(err.message));
    }
    if (user.roles.includes("THREE_PL" as never)) {
      threePlDashboard().then(setTp).catch((err) => setError(err.message));
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    seatStatus().then((s) => setBlocked(s.blocked));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function advanceThreePl(orderId: string, next: OrderStatus) {
    await updateOrderStatus(orderId, next);
    refresh();
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
      <main className="ml-56 max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {error && <p className="mt-4 text-red-600">{error}</p>}

        {ah && (
          <section className="mt-6">
            <h2 className="text-lg font-medium">Account Holder</h2>
            <p className="text-sm text-gray-500">
              {ah.orderCount} orders this cycle — total profit ${ah.totalProfit.toFixed(2)}
            </p>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Order</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Profit</th>
                  <th className="py-2">Your payout</th>
                </tr>
              </thead>
              <tbody>
                {ah.orders.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <td className="py-2">{o.status}</td>
                    <td className="py-2">${o.profit.toFixed(2)}</td>
                    <td className="py-2">${o.payout.toFixed(2)}</td>
                  </tr>
                ))}
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
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Order</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Your net</th>
                </tr>
              </thead>
              <tbody>
                {so.orders.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <td className="py-2">{o.status}</td>
                    <td className="py-2">{o.quantity}</td>
                    <td className="py-2">${o.net.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tp && (
          <section className="mt-8">
            <h2 className="text-lg font-medium">3PL</h2>
            <p className="text-sm text-gray-500">Earnings this cycle: ${tp.totalEarnings.toFixed(2)}</p>

            <h3 className="mt-4 font-medium">Needs processing</h3>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Order</th>
                  <th className="py-2">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tp.toProcess.map((o) => (
                  <tr key={o.orderId} className="border-b">
                    <td className="py-2">{o.ebayOrderRef}</td>
                    <td className="py-2">{o.status}</td>
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
                  </tr>
                ))}
                {tp.toProcess.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-gray-500">
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
                    <td className="py-2">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
