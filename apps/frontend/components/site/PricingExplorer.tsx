"use client";

import type { BillingPeriodDto, PublicPricingDto, SubscriptionPlanDto } from "@ebay-order-management/shared";
import { Button, Skeleton } from "antd";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicPricing, subscriptionPrice } from "@/lib/api";

const rs = (v: number) => `₨ ${Math.round(v).toLocaleString("en-US")}`;

const SEAT_ROWS: { key: keyof SubscriptionPlanDto; label: string; color: string }[] = [
  { key: "maxAccountHolders", label: "Account Holders", color: "var(--ah)" },
  { key: "maxStockOwners", label: "Stock Owners", color: "var(--so)" },
  { key: "maxThreePls", label: "3PLs", color: "var(--tpl)" },
  { key: "maxStaff", label: "Staff", color: "var(--staff)" },
];

const Check = () => (
  <span className="yes" aria-label="Included">
    <svg viewBox="0 0 20 20" fill="#047857" aria-hidden>
      <path d="M8.2 13.4 4.8 10l1.1-1.1 2.3 2.3 5.9-5.9 1.1 1.1z" />
    </svg>
  </span>
);

/**
 * Live plans + billing durations from GET /public/pricing (set by the Super Admin). The first paid plan is marked
 * "Recommended". `included` is the static "every plan includes" grid rendered between the cards and the comparison.
 */
export default function PricingExplorer({ included }: { included: React.ReactNode }) {
  const [data, setData] = useState<PublicPricingDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [periodId, setPeriodId] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getPublicPricing()
      .then((d) => {
        setData(d);
        setPeriodId((cur) => cur ?? d.periods[0]?.id ?? null);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const period: Pick<BillingPeriodDto, "months" | "discountPercent"> =
    data?.periods.find((p) => p.id === periodId) ?? { months: 1, discountPercent: 0 };
  const plans = useMemo(() => data?.plans ?? [], [data]);
  const recommendedId = plans.find((p) => !p.isFree)?.id;
  const maxDiscount = Math.max(0, ...(data?.periods.map((p) => p.discountPercent) ?? []));

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">
            <i>
              <b style={{ background: "var(--ah)" }} />
              <b style={{ background: "var(--so)" }} />
              <b style={{ background: "var(--tpl)" }} />
            </i>
            Pricing
          </span>
          <h1>Every feature on every plan</h1>
          <p className="lead">
            Plans differ only in how many partner accounts you can have. Start free, then upgrade as your team grows.
            {maxDiscount > 0 && ` Pay for longer and save up to ${maxDiscount}%.`}
          </p>
          {data && data.periods.length > 1 && (
            <div className="dur" role="group" aria-label="Billing duration">
              {data.periods.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === periodId} onClick={() => setPeriodId(p.id)}>
                  {p.months} month{p.months === 1 ? "" : "s"}
                  {p.discountPercent > 0 && <em>−{p.discountPercent}%</em>}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ paddingBottom: 96 }}>
        <div className="wrap">
          {failed ? (
            <div className="plan" style={{ alignItems: "center", textAlign: "center", gap: 12 }}>
              <h3>We couldn&apos;t load the plans</h3>
              <p className="desc" style={{ minHeight: 0 }}>Check your connection and try again.</p>
              <Button onClick={load}>Try again</Button>
            </div>
          ) : !data ? (
            <div className="plans" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div className="plan" key={i}>
                  <Skeleton active paragraph={{ rows: 7 }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="plans">
              {plans.map((p) => {
                const price = subscriptionPrice(p, period);
                const recommended = p.id === recommendedId;
                return (
                  <div className={`plan${recommended ? " rec" : ""}`} key={p.id}>
                    {recommended && <span className="badge">Recommended</span>}
                    <h3>{p.name}</h3>
                    <p className="desc">{p.description}</p>
                    <div className="price">
                      {p.isFree ? (
                        <>
                          <strong>Free</strong>
                          <span>forever</span>
                        </>
                      ) : (
                        <>
                          <strong>{rs(price.total / period.months)}</strong>
                          <span>/ month</span>
                        </>
                      )}
                    </div>
                    <p className="billed">
                      {p.isFree ? (
                        "No payment needed."
                      ) : period.months === 1 ? (
                        <>
                          Billed monthly. <b>{rs(price.total)}</b> per month.
                        </>
                      ) : (
                        <>
                          <b>{rs(price.total)}</b> billed for {period.months} months.
                          {price.subtotal > price.total && (
                            <>
                              <br />
                              <span className="save">You save {rs(price.subtotal - price.total)}</span>
                            </>
                          )}
                        </>
                      )}
                    </p>
                    <Link className={`btn ${recommended ? "btn-dark" : "btn-light"} btn-block`} href="/register">
                      {p.isFree ? "Start free" : `Choose ${p.name}`}
                    </Link>
                    <ul className="seats">
                      {SEAT_ROWS.map((r) => (
                        <li key={r.key}>
                          <i style={{ background: r.color }} />
                          {r.label}
                          <b>{p[r.key] as number}</b>
                        </li>
                      ))}
                      <li className="admin">
                        <i style={{ background: "#c5c8d6" }} />
                        Admin
                        <b style={{ color: "var(--muted)" }}>Free</b>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <p className="note">
            Prices in Pakistani rupees. Invited accounts count toward limits. Your Admin account is always free. Paid plans start after
            you create your company, from its Subscription page.
          </p>
          {included}
        </div>
      </section>

      {data && plans.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="head center">
              <h2>Compare account limits</h2>
              <p>Each plan sets how many accounts you can have for each role.</p>
            </div>
            <div className="cmp">
              <div className="cmp-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Accounts</th>
                      {plans.map((p) => (
                        <th key={p.id} className={p.id === recommendedId ? "rec" : undefined}>
                          {p.name}
                          <small>{p.isFree ? "Free" : `${rs(subscriptionPrice(p, period).total / period.months)} / month`}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SEAT_ROWS.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <i style={{ background: r.color }} />
                          {r.label}
                        </td>
                        {plans.map((p) => (
                          <td key={p.id}>{p[r.key] as number}</td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <i style={{ background: "var(--muted)" }} />
                        Admin
                      </td>
                      <td colSpan={plans.length}>1 included free on every plan</td>
                    </tr>
                    <tr className="grp">
                      <td colSpan={plans.length + 1}>Included on every plan</td>
                    </tr>
                    <tr>
                      <td>Orders, products and invoices</td>
                      <td colSpan={plans.length}>Unlimited</td>
                    </tr>
                    {["Partner portals and dashboards", "Multi-currency with locked rates"].map((f) => (
                      <tr key={f}>
                        <td>{f}</td>
                        {plans.map((p) => (
                          <td key={p.id}>
                            <Check />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td>Custom invoice templates</td>
                      <td colSpan={plans.length}>Up to 5 per company</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
