"use client";

import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ROLE_COLORS } from "@/lib/brand";

/**
 * The portal's Company overview (app/dashboard/page.tsx) with example data: same KPIs, charts, titles and status colors.
 */
const ORDERS = [4, 5, 3, 6, 7, 5, 4, 6, 7, 8, 5, 6, 7, 6, 5, 7, 8, 6, 7, 9, 6, 5, 7, 8, 7, 6, 8, 7, 6, 5];
const AH_PAYOUT = [2100, 3400, 1800, 2900, 3600, 2400, 2200, 3100, 3300, 4100, 2600, 2800, 3500, 2700, 2300, 3200, 3900, 2500, 3000, 4200, 2600, 2100, 3100, 3600, 2900, 2500, 3700, 3000, 2400, 1720];
const TPL_FULFILLED = [1, 2, 1, 3, 2, 2, 1, 3, 2, 3, 2, 2, 3, 2, 1, 3, 3, 2, 2, 4, 2, 2, 2, 3, 2, 2, 3, 2, 2, 1];
const daily = (values: number[]) => values.map((value, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value }));

/** Same colors as STATUS_COLORS in the portal dashboard. */
const STATUS = [
  { name: "Pending", value: 9, color: "#f59e0b" },
  { name: "Processing", value: 12, color: "#3b82f6" },
  { name: "Shipped", value: 52, color: "#8b5cf6" },
  { name: "Delivered", value: 104, color: "#10b981" },
  { name: "Cancelled", value: 5, color: "#ef4444" },
  { name: "Refunded", value: 4, color: "#6b7280" },
];
const STATUS_TOTAL = STATUS.reduce((a, s) => a + s.value, 0);

const PER_ACCOUNT_HOLDER: [string, number][] = [["Ayesha Khan", 52], ["Bilal Ahmed", 41], ["Sara Malik", 36], ["Usman Tariq", 31], ["Hina Raza", 26]];
const PER_STOCK_OWNER: [string, number][] = [["Northgate Supply", 18], ["Kamran Traders", 14], ["Zara Imports", 11], ["Hassan & Co", 7]];
const UNITS_BY_PRODUCT: [string, number][] = [["Air fryer", 38], ["Stand mixer", 27], ["Kettle", 24], ["Desk lamp", 17], ["USB hub", 12]];

const AGING = [
  { ref: "24-11873-90351", status: "PENDING", color: "#f59e0b", days: 5, ah: "Bilal Ahmed", so: "Northgate Supply", tpl: "FastPack Lahore" },
  { ref: "24-11873-90288", status: "PROCESSING", color: "#3b82f6", days: 4, ah: "Sara Malik", so: "Kamran Traders", tpl: "FastPack Lahore" },
  { ref: "24-11873-90240", status: "PENDING", color: "#f59e0b", days: 3, ah: "Usman Tariq", so: "—", tpl: "—" },
];

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pkr = (v: number) => `₨ ${Math.round(v).toLocaleString("en-US")}`;

function DailyLine({ values, color, unit, small }: { values: number[]; color: string; unit: string; small?: boolean }) {
  return (
    <div className={`rchart${small ? " sm" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={daily(values)} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#e6e7ef" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7086" }} tickFormatter={(d: string) => d.slice(5)} interval={6} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7086" }} allowDecimals={false} axisLine={false} tickLine={false} width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
          <Tooltip
            cursor={{ stroke: "#151827", strokeOpacity: 0.25 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rtip">
                  {label}
                  <b>{unit === "PKR" ? pkr(Number(payload[0].value)) : `${payload[0].value} ${unit}`}</b>
                </div>
              ) : null
            }
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HBars({ rows, color, unit }: { rows: [string, number][]; color: string; unit: string }) {
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <div className="hbars">
      {rows.map(([name, v]) => (
        <div className="hb" key={name} title={`${name}: ${v} ${unit}`}>
          <span>{name}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(v / max) * 100}%`, background: color }} />
          </div>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPreview() {
  return (
    <>
      <div className="dash" aria-label="Example company overview">
        <div className="dash-top">
          <div>
            <h3>Company overview</h3>
            <p>{sum(ORDERS)} orders this cycle, total company profit ₨ 357,300.00</p>
          </div>
          <span className="cycle">Example data · billing cycle 1 Sep to 30 Sep 2026</span>
        </div>
        <div className="kpis">
          <div className="kpi hero"><small>Company profit this cycle</small><strong>₨ 357,300.00</strong></div>
          <div className="kpi k-a"><small>Active users</small><strong>21</strong></div>
          <div className="kpi k-b"><small>Disabled users</small><strong>2</strong></div>
          <div className="kpi k-c"><small>Invited (pending)</small><strong>3</strong></div>
          <div className="kpi alert"><small>Aging orders</small><strong>{AGING.length}</strong></div>
        </div>
        <div className="roles-row">
          <span>Users per role</span>
          {[["Admin", 1], ["Staff", 3], ["Account Holder", 8], ["Stock Owner", 6], ["3PL", 3]].map(([k, v]) => (
            <span className="rtag" key={k}>
              {k} <b>{v}</b>
            </span>
          ))}
        </div>
        <div className="charts">
          <div className="chart">
            <h4>Orders per day this cycle</h4>
            <DailyLine values={ORDERS} color="#3b82f6" unit="orders" />
          </div>
          <div className="chart">
            <h4>Orders by status</h4>
            <div className="donut-wrap">
              <div className="donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={STATUS} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                      {STATUS.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rtip">
                            {payload[0].name}
                            <b>{payload[0].value} orders</b>
                          </div>
                        ) : null
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-c">
                  <div>
                    <b>{STATUS_TOTAL}</b>
                    <span>orders</span>
                  </div>
                </div>
              </div>
              <div className="slist">
                {STATUS.map((s) => (
                  <div key={s.name}>
                    <i style={{ background: s.color }} />
                    {s.name}
                    <b>{s.value}</b>
                    <em>{Math.round((s.value / STATUS_TOTAL) * 100)}%</em>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart">
            <h4>Orders per account holder this cycle</h4>
            <HBars rows={PER_ACCOUNT_HOLDER} color="#8b5cf6" unit="orders" />
          </div>
          <div className="chart">
            <h4>Products per stock owner</h4>
            <HBars rows={PER_STOCK_OWNER} color="#10b981" unit="products" />
          </div>
        </div>
        <div className="aging">
          <h4>Orders stuck in status for 3+ days</h4>
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Order</th><th>Status</th><th>Days</th><th>Account Holder</th><th>Stock Owner</th><th>3PL</th></tr>
              </thead>
              <tbody>
                {AGING.map((o) => (
                  <tr key={o.ref}>
                    <td>{o.ref}</td>
                    <td><span className="st" style={{ background: o.color }}>{o.status}</span></td>
                    <td className="days">{o.days}</td>
                    <td>{o.ah}</td>
                    <td>{o.so}</td>
                    <td>{o.tpl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="partner-head">
        <div>
          <h3>Partners get their own dashboard</h3>
          <p>Each role logs in to charts built from their own orders only.</p>
        </div>
      </div>
      <div className="pcharts">
        <div className="chart">
          <span className="who" style={{ color: ROLE_COLORS.accountHolder }}><i style={{ background: ROLE_COLORS.accountHolder }} />Account Holder</span>
          <h4>Your payout per day</h4>
          <div className="ptotal">{pkr(sum(AH_PAYOUT))}</div>
          <DailyLine values={AH_PAYOUT} color="#10b981" unit="PKR" small />
        </div>
        <div className="chart">
          <span className="who" style={{ color: ROLE_COLORS.stockOwner }}><i style={{ background: ROLE_COLORS.stockOwner }} />Stock Owner</span>
          <h4>Units sold by product</h4>
          <div className="ptotal">{sum(UNITS_BY_PRODUCT.map((r) => r[1]))} items</div>
          <HBars rows={UNITS_BY_PRODUCT} color="#f59e0b" unit="units" />
        </div>
        <div className="chart">
          <span className="who" style={{ color: ROLE_COLORS.threePl }}><i style={{ background: ROLE_COLORS.threePl }} />3PL</span>
          <h4>Orders fulfilled per day</h4>
          <div className="ptotal">{sum(TPL_FULFILLED)} orders</div>
          <DailyLine values={TPL_FULFILLED} color="#8b5cf6" unit="orders" small />
        </div>
      </div>
    </>
  );
}
