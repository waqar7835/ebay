import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettings } from "@/lib/siteSettings";

export const metadata: Metadata = {
  title: "How it works",
  description: "From first sale to settled invoice: register, invite partners, add products, log orders, ship and invoice.",
};

/**
 * Mockups mirror the real screens; the worked example matches FinanceService
 * (AH 40% of profit, SO profit-share cut 30%, 3PL flat fee, staff 5% of company profit).
 */
export default async function HowItWorksPage() {
  const { brandName } = await getSiteSettings();
  return (
    <div className="page-how">
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">
            <i>
              <b style={{ background: "var(--ah)" }}></b>
              <b style={{ background: "var(--so)" }}></b>
              <b style={{ background: "var(--tpl)" }}></b>
            </i>
            How it works
          </span>
          <h1>From first sale to settled invoice</h1>
          <p className="lead">
            Set your company up once. After that, every order you log is split between your partners and is ready to invoice when
            it ships.
          </p>
          <nav className="jump" aria-label="Steps">
            <a href="#s1">
              <span style={{ background: "var(--admin)" }}>1</span>Register
            </a>
            <a href="#s2">
              <span style={{ background: "var(--ah)" }}>2</span>Invite partners
            </a>
            <a href="#s3">
              <span style={{ background: "var(--so)" }}>3</span>Add products
            </a>
            <a href="#s4">
              <span style={{ background: "var(--tpl)" }}>4</span>Log orders
            </a>
            <a href="#s5">
              <span style={{ background: "var(--staff)" }}>5</span>Ship and track
            </a>
            <a href="#s6">
              <span style={{ background: "var(--ink)" }}>6</span>Invoice
            </a>
          </nav>
        </div>
      </section>

      <section style={{ paddingBottom: 96 }}>
        <div className="wrap steps">
          <article className="step" id="s1">
            <div className="copy">
              <span className="num" style={{ color: "var(--admin)" }}>
                <b style={{ background: "var(--admin)" }}>1</b>Admin
              </span>
              <h2>Register your company</h2>
              <p>
                Sign up with your company name, email and a password. We email you a 6-digit code and a link. Use either one to
                confirm your email, then log in.
              </p>
              <ul className="ticks" style={{ "--c": "var(--admin)" } as React.CSSProperties}>
                <li>You become the company Admin, free on every plan</li>
                <li>You start on the free Starter plan</li>
                <li>Add your logo and default currency on your Profile</li>
              </ul>
              <Link className="btn btn-dark" href="/register" style={{ marginTop: 24 }}>
                Create your company
              </Link>
            </div>
            <div className="mock auth-mock" aria-hidden>
              <div className="card">
                <div className="stepper">
                  <span className="done">
                    <b>1</b>Details
                  </span>
                  <em></em>
                  <span className="on">
                    <b>2</b>Verify email
                  </span>
                  <em></em>
                  <span>
                    <b>3</b>Done
                  </span>
                </div>
                <h5 style={{ fontFamily: "var(--display)", fontSize: 22, margin: "0" }}>Check your email</h5>
                <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>owner@alphadrop.pk</b>. It expires in 30 minutes.
                </p>
                <div className="code">
                  <span>4</span>
                  <span>8</span>
                  <span>1</span>
                  <span>9</span>
                  <span className="on">2</span>
                  <span></span>
                </div>
                <div className="fakebtn">Verify email</div>
              </div>
              <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                <span className="thumb" style={{ background: "var(--admin)", borderRadius: 9 }}>
                  AD
                </span>
                <span>
                  <b style={{ color: "var(--ink)" }}>Alpha Drop</b>
                  <br />
                  <span style={{ color: "var(--muted)" }}>Company name · owner@alphadrop.pk</span>
                </span>
              </div>
            </div>
          </article>

          <article className="step" id="s2">
            <div className="copy">
              <span className="num" style={{ color: "var(--ah)" }}>
                <b style={{ background: "var(--ah)" }}>2</b>Admin or Staff
              </span>
              <h2>Invite your partners</h2>
              <p>Add each person with their role, currency and terms. They get an email invite and set their own password.</p>
              <div className="who">
                <span>Account Holder: share % and 3PL charge</span>
                <span>Stock Owner: profit share or fixed</span>
                <span>3PL: fee per order</span>
                <span>Staff: permissions</span>
              </div>
              <ul className="ticks" style={{ "--c": "var(--ah)" } as React.CSSProperties}>
                <li>The same email can hold a separate account for each role</li>
                <li>Changing terms later only affects new orders</li>
              </ul>
            </div>
            <div className="mock" aria-hidden>
              <div className="card">
                <h5>Invite a user</h5>
                <div className="fld">
                  <label>Role</label>
                  <div className="chipset">
                    <span className="chip on">Account Holder</span>
                    <span className="chip">Stock Owner</span>
                    <span className="chip">3PL</span>
                    <span className="chip">Staff</span>
                  </div>
                </div>
                <div className="row2" style={{ marginTop: 10 }}>
                  <div className="fld">
                    <label>Name</label>
                    <div className="in">Ayesha Khan</div>
                  </div>
                  <div className="fld">
                    <label>Currency</label>
                    <div className="in">
                      GBP <small>▾</small>
                    </div>
                  </div>
                </div>
                <div className="row2" style={{ marginTop: 10 }}>
                  <div className="fld">
                    <label>Profit share</label>
                    <div className="in">
                      40 <small>%</small>
                    </div>
                  </div>
                  <div className="fld">
                    <label>3PL charge per order</label>
                    <div className="in">£ 6.00</div>
                  </div>
                </div>
              </div>
              <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="thumb" style={{ background: "var(--ah)", borderRadius: "50%" }}>
                  AK
                </span>
                <div style={{ fontSize: 14 }}>
                  <b style={{ color: "var(--ink)" }}>Ayesha Khan (Account Holder)</b>
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>Invite sent · waiting to accept</span>
                </div>
              </div>
            </div>
          </article>

          <article className="step" id="s3">
            <div className="copy">
              <span className="num" style={{ color: "var(--so)" }}>
                <b style={{ background: "var(--so)" }}>3</b>Admin or Staff
              </span>
              <h2>Add your products</h2>
              <p>Each product has three prices, entered in its Stock Owner&apos;s currency, and up to four images.</p>
              <div className="who">
                <span>Cost: what the Stock Owner paid</span>
                <span>Buy price: what you pay them</span>
                <span>Sell price: what you charge the Account Holder</span>
              </div>
              <ul className="ticks" style={{ "--c": "var(--so)" } as React.CSSProperties}>
                <li>
                  <b>Stock</b> products are held at one 3PL warehouse
                </li>
                <li>
                  <b>Dropship</b> products ship straight from the supplier
                </li>
              </ul>
            </div>
            <div className="mock" aria-hidden>
              <div className="card">
                <h5>New product</h5>
                <div className="row2">
                  <div className="fld">
                    <label>Title</label>
                    <div className="in">Air fryer 4.5L</div>
                  </div>
                  <div className="fld">
                    <label>Stock Owner</label>
                    <div className="in">
                      Northgate Supply <small>▾</small>
                    </div>
                  </div>
                </div>
                <div className="row3" style={{ marginTop: 10 }}>
                  <div className="fld">
                    <label>Cost</label>
                    <div className="in">£ 20.00</div>
                  </div>
                  <div className="fld">
                    <label>Buy price</label>
                    <div className="in">£ 27.50</div>
                  </div>
                  <div className="fld">
                    <label>Sell price</label>
                    <div className="in">£ 31.00</div>
                  </div>
                </div>
                <div className="fld" style={{ marginTop: 10 }}>
                  <label>Fulfillment</label>
                  <div className="chipset">
                    <span className="chip on">Stock · FastPack Lahore</span>
                    <span className="chip">Dropship</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="step" id="s4">
            <div className="copy">
              <span className="num" style={{ color: "var(--tpl)" }}>
                <b style={{ background: "var(--tpl)" }}>4</b>Admin or Staff
              </span>
              <h2>Log each order</h2>
              <p>
                Enter the eBay order number, the Account Holder, the items and the eBay proceeds. Payouts for everyone are
                calculated as soon as you save.
              </p>
              <ul className="ticks" style={{ "--c": "var(--tpl)" } as React.CSSProperties}>
                <li>Several items per order if they&apos;re at the same 3PL</li>
                <li>Prices, shares and exchange rates are locked on the order</li>
                <li>The same eBay order number can&apos;t be entered twice</li>
              </ul>
            </div>
            <div className="mock" aria-hidden>
              <div className="card">
                <h5>Order 24-11873-90412</h5>
                <div className="item">
                  <span className="thumb" style={{ background: "#f59e0b" }}>
                    AF
                  </span>
                  <div>
                    Air fryer 4.5L<small>Northgate Supply · £31.00 each</small>
                  </div>
                  <b>× 2</b>
                </div>
                <div className="row2" style={{ marginTop: 12 }}>
                  <div className="fld">
                    <label>eBay proceeds</label>
                    <div className="in">£ 120.00</div>
                  </div>
                  <div className="fld">
                    <label>Shipping cost</label>
                    <div className="in">
                      £ 0.00 <small>label on eBay</small>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <h5>Exchange rates locked on this order</h5>
                <div className="line">
                  <span>GBP → PKR</span>
                  <b>374.20</b>
                </div>
                <div className="line">
                  <span className="m">Updated hourly. You can override any rate.</span>
                  <span className="m">12 Sep, 14:05</span>
                </div>
              </div>
            </div>
          </article>

          <article className="step" id="s5">
            <div className="copy">
              <span className="num" style={{ color: "var(--staff)" }}>
                <b style={{ background: "var(--staff)" }}>5</b>3PL and Staff
              </span>
              <h2>Ship and track</h2>
              <p>
                Your 3PL sees new orders in their own portal, prints the shipping label, adds the tracking number and moves the
                order along.
              </p>
              <ul className="ticks" style={{ "--c": "var(--staff)" } as React.CSSProperties}>
                <li>Orders stuck in one status for 3+ days are flagged</li>
                <li>Dropship 3PLs enter the price they paid the supplier</li>
                <li>Refunds after invoicing become a refund adjustment</li>
              </ul>
            </div>
            <div className="mock" aria-hidden>
              <div className="card">
                <div className="flow">
                  <span style={{ background: "#f59e0b" }}>PENDING</span>
                  <i></i>
                  <span style={{ background: "#3b82f6" }}>PROCESSING</span>
                  <i></i>
                  <span style={{ background: "#8b5cf6" }}>SHIPPED</span>
                  <i></i>
                  <span style={{ background: "#10b981" }}>DELIVERED</span>
                </div>
                <div className="timeline">
                  <div className="tl">
                    <i style={{ background: "#10b981" }}></i>
                    <span>
                      <b>Delivered</b>
                      <br />
                      <em>Tracking RM 4412 9921 GB</em>
                    </span>
                    <em>16 Sep</em>
                  </div>
                  <div className="tl">
                    <i style={{ background: "#8b5cf6" }}></i>
                    <span>
                      <b>Shipped by FastPack Lahore</b>
                      <br />
                      <em>Label printed, tracking added</em>
                    </span>
                    <em>13 Sep</em>
                  </div>
                  <div className="tl">
                    <i style={{ background: "#3b82f6" }}></i>
                    <span>
                      <b>Processing</b>
                    </span>
                    <em>12 Sep</em>
                  </div>
                  <div className="tl">
                    <i style={{ background: "#f59e0b" }}></i>
                    <span>
                      <b>Order logged</b>
                    </span>
                    <em>12 Sep</em>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="step" id="s6">
            <div className="copy">
              <span className="num" style={{ color: "var(--ink)" }}>
                <b style={{ background: "var(--ink)" }}>6</b>Admin or Staff
              </span>
              <h2>Invoice and get paid</h2>
              <p>
                Pick a partner, tick their shipped and delivered orders, add any adjustments, review the draft PDF and approve.
                Partners download their invoices from their portal.
              </p>
              <ul className="ticks" style={{ "--c": "var(--ink)" } as React.CSSProperties}>
                <li>Account Holders are invoiced in their own currency</li>
                <li>An order can&apos;t end up on two invoices for the same role</li>
                <li>Five layouts with your logo and colors</li>
              </ul>
            </div>
            <div className="mock" aria-hidden>
              <div className="wiz">
                <span className="done">Partner</span>
                <span className="done">Orders</span>
                <span className="done">Adjustments</span>
                <span className="on">Review</span>
                <span>Approve</span>
              </div>
              <div className="pdf">
                <div className="pdf-h">
                  <b>ACCOUNT INVOICE</b>
                  <span>AD-2026-007</span>
                </div>
                <div className="pdf-b">
                  <div className="line">
                    <span>Air fryer × 2 · company share</span>
                    <b>£ 31.20</b>
                  </div>
                  <div className="line">
                    <span>Buying price</span>
                    <b>£ 62.00</b>
                  </div>
                  <div className="line">
                    <span>3PL charge</span>
                    <b>£ 6.00</b>
                  </div>
                </div>
                <div className="wm">DRAFT</div>
                <div className="total">
                  <span>Ayesha Khan owes</span>
                  <span>£ 99.20</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="section" id="maths" style={{ paddingTop: "0" }}>
        <div className="wrap">
          <div className="head center">
            <h2>One order, everyone&apos;s share</h2>
            <p>Here&apos;s order 24-11873-90412 from the steps above, split exactly the way {brandName} calculates it.</p>
          </div>
          <div className="math-top">
            <div className="order-card">
              <h3>Order 24-11873-90412</h3>
              <p className="sub">2 × Air fryer, shipped by FastPack Lahore</p>
              <div style={{ marginTop: 16 }}>
                <div className="line">
                  <span>eBay proceeds</span>
                  <b>£ 120.00</b>
                </div>
                <div className="line">
                  <span>Shipping (label bought on eBay)</span>
                  <b>£ 0.00</b>
                </div>
                <div className="line">
                  <span>Sell price × 2</span>
                  <b>− £ 62.00</b>
                </div>
                <div className="line">
                  <span>3PL charge</span>
                  <b>− £ 6.00</b>
                </div>
                <div className="line">
                  <span style={{ color: "#fff", fontWeight: "700" }}>Order profit</span>
                  <b style={{ color: "#86efac" }}>£ 52.00</b>
                </div>
              </div>
            </div>
            <div className="po co">
              <div className="top">
                <div>
                  <span className="tag" style={{ color: "var(--ink)" }}>
                    <i style={{ background: "var(--ink)" }}></i>Company
                  </span>
                  <strong style={{ display: "block", marginTop: 8 }}>£ 44.20</strong>
                </div>
                <p>Company profit comes from four places</p>
              </div>
              <div className="bars">
                <div>
                  <span>Account Holder remainder</span>
                  <span className="t" style={{ width: "100%" }}></span>
                  <b>£ 31.20</b>
                </div>
                <div>
                  <span>Product markup</span>
                  <span className="t" style={{ width: "22.4%" }}></span>
                  <b>£ 7.00</b>
                </div>
                <div>
                  <span>Stock Owner share</span>
                  <span className="t" style={{ width: "14.4%" }}></span>
                  <b>£ 4.50</b>
                </div>
                <div>
                  <span>3PL markup</span>
                  <span className="t" style={{ width: "4.8%" }}></span>
                  <b>£ 1.50</b>
                </div>
              </div>
            </div>
          </div>
          <div className="payouts">
            <div className="po">
              <span className="tag" style={{ color: "var(--ah)" }}>
                <i style={{ background: "var(--ah)" }}></i>Account Holder
              </span>
              <strong>£ 20.80</strong>
              <p>40% of the order profit</p>
              <code>52.00 × 40%</code>
            </div>
            <div className="po">
              <span className="tag" style={{ color: "var(--so)" }}>
                <i style={{ background: "var(--so)" }}></i>Stock Owner
              </span>
              <strong>£ 50.50</strong>
              <p>Buy price, less a 30% share of their profit</p>
              <code>27.50 × 2 − 30% × (27.50 − 20.00) × 2</code>
            </div>
            <div className="po">
              <span className="tag" style={{ color: "var(--tpl)" }}>
                <i style={{ background: "var(--tpl)" }}></i>3PL
              </span>
              <strong>£ 4.50</strong>
              <p>Flat fee, once per order</p>
              <code>payout per order</code>
            </div>
            <div className="po">
              <span className="tag" style={{ color: "var(--staff)" }}>
                <i style={{ background: "var(--staff)" }}></i>Staff (optional)
              </span>
              <strong>£ 2.21</strong>
              <p>5% of the company&apos;s profit</p>
              <code>44.20 × 5%</code>
            </div>
          </div>
          <div className="snap">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#151827"
              strokeWidth="2"
              style={{ flex: "0 0 20px", marginTop: 2 }}
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>
              <b>These numbers are locked on the order.</b> If Ayesha&apos;s share changes to 45% next month, this order still
              pays her £ 20.80. Behind the scenes everything is stored in PKR at the order&apos;s locked rate.
            </span>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <div className="cta-box">
            <div>
              <h2>Log your first order today</h2>
              <p>Free on Starter. Most teams are set up in an afternoon.</p>
            </div>
            <div className="ctas">
              <Link className="btn btn-light" href="/register">
                Create your company
              </Link>
              <Link className="btn" style={{ color: "#fff", border: "1px solid rgba(255,255,255,.3)" }} href="/pricing">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
