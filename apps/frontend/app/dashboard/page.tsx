"use client";

import type { OrderStatus, ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  AccountHolderDashboard,
  DashboardOrderFilters,
  StockOwnerDashboard,
  ThreePlDashboard,
  accountHolderDashboard,
  getStoredUser,
  getToken,
  listProducts,
  mediaUrl,
  seatStatus,
  stockOwnerDashboard,
  threePlDashboard,
  updateOrderStatus,
} from "@/lib/api";

const STATUS_OPTIONS: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

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

export default function DashboardPage() {
  const router = useRouter();
  const user = getStoredUser();
  const [blocked, setBlocked] = useState(false);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [ah, setAh] = useState<AccountHolderDashboard | null>(null);
  const [so, setSo] = useState<StockOwnerDashboard | null>(null);
  const [tp, setTp] = useState<ThreePlDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ahFilter, setAhFilter] = useState<FilterState>(emptyFilter);
  const [soFilter, setSoFilter] = useState<FilterState>(emptyFilter);
  const [tpFilter, setTpFilter] = useState<FilterState>(emptyFilter);
  const [ahInit, setAhInit] = useState(false);
  const [soInit, setSoInit] = useState(false);
  const [tpInit, setTpInit] = useState(false);

  const productById = new Map(products.map((p) => [p.id, p]));

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
      <main className="ml-56 max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {error && <p className="mt-4 text-red-600">{error}</p>}

        {ah && (
          <section className="mt-6">
            <h2 className="text-lg font-medium">Account Holder</h2>
            <p className="text-sm text-gray-500">
              {ah.orderCount} orders this cycle — total profit ${ah.totalProfit.toFixed(2)}
            </p>
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
