import type { Metadata } from "next";
import Link from "next/link";
import CtaBox from "@/components/site/CtaBox";
import DashboardPreview from "@/components/site/DashboardPreview";
import Faq, { type FaqItem } from "@/components/site/Faq";
import RoleSwitcher from "@/components/site/RoleSwitcher";
import { ROLE_COLORS, TAGLINE } from "@/lib/brand";
import { getSiteSettings } from "@/lib/siteSettings";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getSiteSettings();
  return { title: { absolute: `${brandName} · Orders and partner payouts for eBay resellers` }, description: TAGLINE };
}

const faq = (brandName: string): FaqItem[] => [
  { q: `Does ${brandName} connect to my eBay account?`, a: "Not directly. You log each order with its eBay order number, items and proceeds. Order numbers are checked so the same sale can't be entered twice." },
  { q: "Do my partners pay for their own logins?", a: "No. Partners are accounts on your company's plan. Each plan sets how many Account Holders, Stock Owners, 3PLs and Staff you can have, and you as the Admin are always free." },
  { q: "What happens to old orders if I change a partner's share?", a: "Nothing. Prices, share percentages and exchange rates are saved on each order when it's created, so only new orders use the new terms." },
  { q: "Can one order hold products from different Stock Owners?", a: "Yes, as long as the items are held at the same 3PL warehouse. Each Stock Owner is paid only for their own items, and the 3PL fee is charged once per order." },
  { q: "Which currencies are supported?", a: "Partners can work in GBP, USD, EUR, AUD or CAD. Amounts convert to PKR at a rate that's locked on the order, and Account Holders are invoiced in their own currency." },
  { q: "What happens when my subscription ends?", a: "Your company moves to the free plan and partner accounts are paused. Your data stays. Renew and accounts come back automatically, up to your new plan's limits." },
];

const STEPS = [
  { color: ROLE_COLORS.admin, title: "Register", text: "Create your company and verify your email." },
  { color: ROLE_COLORS.accountHolder, title: "Invite partners", text: "Set terms and currency for each one." },
  { color: ROLE_COLORS.stockOwner, title: "Log orders", text: "Payouts appear as soon as you save." },
  { color: ROLE_COLORS.threePl, title: "Invoice", text: "Bill shipped orders and mark them paid." },
];

export default async function HomePage() {
  const { brandName } = await getSiteSettings();
  return (
    <div className="page-home">
      <section className="hero">
        <div className="wrap">
          <div className="hero-top">
            <h1>
              Sell together. <span className="hl">Get paid fairly.</span>
            </h1>
            <p className="lead">
              {brandName} gives every partner in your eBay business their own view of orders, earnings and invoices, with the maths
              done for them.
            </p>
            <div className="ctas">
              <Link className="btn btn-dark" href="/register">Create your company</Link>
              <Link className="btn btn-light" href="/how-it-works">How it works</Link>
            </div>
          </div>
          <RoleSwitcher />
        </div>
      </section>

      <section className="section" id="features" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <div className="head">
            <h2>Built around how resellers actually split money</h2>
            <p>Every share and rate is saved on the order when it&apos;s created, so payouts never change behind anyone&apos;s back.</p>
          </div>
          <div className="grid">
            <div className="card c-7">
              <h3>Revenue share, calculated on save</h3>
              <p>Profit share or fixed payouts for Stock Owners, a percentage for Account Holders, a flat fee for 3PLs and optional staff share.</p>
              <div className="mini">
                <div><span>Order profit</span><b>£52.00</b></div>
                <div><span>Account Holder 40%</span><b>£20.80</b></div>
                <div><span>Company keeps</span><b>£31.20</b></div>
              </div>
            </div>
            <div className="card c-5 dark">
              <h3>Each partner&apos;s own currency</h3>
              <p>Amounts are entered in the partner&apos;s currency and converted to PKR at a rate locked on the order.</p>
              <div className="cur">
                {["£", "$", "€", "A$", "C$", "₨"].map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
            <div className="card c-4">
              <h3>Invoices with your branding</h3>
              <p>Five layouts, your colors and logo. Preview the draft PDF before approving.</p>
              <div className="sheets" aria-hidden>
                <i style={{ background: "linear-gradient(180deg,#334155 28%,#fff 28%)" }} />
                <i style={{ background: "linear-gradient(90deg,#1d4ed8 34%,#fff 34%)" }} />
                <i style={{ background: "linear-gradient(180deg,#be185d 34%,#fff 34%)" }} />
              </div>
            </div>
            <div className="card c-4">
              <h3>Multi-item orders</h3>
              <p>Several products from one warehouse on one order. Each Stock Owner is paid for their own items.</p>
              <div className="mini">
                <div><span>Air fryer × 2 · Owner A</span><b>£50.50</b></div>
                <div><span>USB hub · Owner B</span><b>£9.20</b></div>
              </div>
            </div>
            <div className="card c-4">
              <h3>Staff with limits</h3>
              <p>Decide who can manage users, view financials or create invoices. Stuck orders are flagged for them.</p>
              <div className="mini">
                <div><span>Manage users</span><b className="on">On</b></div>
                <div><span>View financials</span><b className="off">Off</b></div>
                <div><span>Create invoices</span><b className="on">On</b></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="dashboard" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="head">
            <h2>The dashboard you get on day one</h2>
            <p>This is the Company overview Admins and Staff see after logging in, shown here with example data.</p>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="head">
            <h2>Running in four steps</h2>
            <p>
              Want the details? <Link href="/how-it-works" style={{ fontWeight: 700, textDecoration: "underline", color: "var(--ink)" }}>Read the full guide</Link>.
            </p>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step" key={s.title}>
                <span style={{ background: s.color }}>{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Faq id="faq" title="Questions resellers ask us" items={faq(brandName)} />
      <CtaBox title="Bring your partners on board" text="Start on the free plan. Upgrade when you add more people." secondary={{ href: "/pricing", label: "See pricing" }} />
    </div>
  );
}
