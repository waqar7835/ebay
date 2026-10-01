import type { Metadata } from "next";
import CtaBox from "@/components/site/CtaBox";
import Faq, { type FaqItem } from "@/components/site/Faq";
import PricingExplorer from "@/components/site/PricingExplorer";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Every feature on every plan. Plans only differ in how many partner accounts you can have.",
};

const FAQ: FaqItem[] = [
  {
    q: "Is the free plan really free?",
    a: "Yes. It has no time limit and includes every feature, with a smaller number of partner accounts. Your Admin account is always free.",
  },
  {
    q: "What counts as an account?",
    a: "Every active or invited Account Holder, Stock Owner, 3PL and Staff account counts toward your plan's limit for that role. Disabled accounts don't count, and your Admin account never does.",
  },
  {
    q: "What happens if I reach a limit?",
    a: "You can't invite or re-enable more accounts for that role until you upgrade. Nobody already on your team is removed.",
  },
  { q: "Can I pay by card?", a: "Not yet. Payment is by bank transfer with a receipt upload. Card payments are on our list." },
  {
    q: "What if my plan ends while orders are open?",
    a: "Your orders, invoices and history stay exactly as they are. Partner accounts pause until you renew, and you can re-enable accounts within the free plan's limits in the meantime.",
  },
];

const INCLUDED = (
  <div className="incl">
    <div className="inc">
      <div className="ic" style={{ background: "var(--admin-bg)", color: "var(--admin)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7h18M3 12h18M3 17h12" />
        </svg>
      </div>
      <div>
        <h4>Unlimited orders and products</h4>
        <p>No caps on how much you sell. Multi-item orders included.</p>
      </div>
    </div>
    <div className="inc">
      <div className="ic" style={{ background: "var(--ah-bg)", color: "var(--ah)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" />
        </svg>
      </div>
      <div>
        <h4>Automatic revenue share</h4>
        <p>Account Holder, Stock Owner, 3PL and staff payouts on every order.</p>
      </div>
    </div>
    <div className="inc">
      <div className="ic" style={{ background: "var(--so-bg)", color: "var(--so)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </div>
      <div>
        <h4>Branded invoices</h4>
        <p>Five layouts plus up to five custom templates with your logo.</p>
      </div>
    </div>
    <div className="inc">
      <div className="ic" style={{ background: "var(--tpl-bg)", color: "var(--tpl)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      </div>
      <div>
        <h4>Six currencies</h4>
        <p>GBP, USD, EUR, AUD and CAD, converted to PKR at locked rates.</p>
      </div>
    </div>
    <div className="inc">
      <div className="ic" style={{ background: "var(--admin-bg)", color: "var(--admin)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
        </svg>
      </div>
      <div>
        <h4>Dashboards for every role</h4>
        <p>Company overview for you, personal dashboards for partners.</p>
      </div>
    </div>
    <div className="inc">
      <div className="ic" style={{ background: "var(--ah-bg)", color: "var(--ah)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <div>
        <h4>Staff permissions</h4>
        <p>Choose who manages users, sees financials or creates invoices.</p>
      </div>
    </div>
  </div>
);

export default function PricingPage() {
  return (
    <div className="page-pricing">
      <PricingExplorer included={INCLUDED} />

      <section className="section" style={{ paddingTop: "0" }}>
        <div className="wrap pay">
          <div>
            <div className="head">
              <h2>How paying works</h2>
              <p>
                Payment is by bank transfer. Upload your receipt from the Subscription page and we switch your plan on once
                it&apos;s checked.
              </p>
            </div>
            <div className="rules">
              <div className="rule">
                <i style={{ background: "var(--good)" }}></i>
                <span>
                  <b>Renew early</b> and the new time is added after your current end date.
                </span>
              </div>
              <div className="rule">
                <i style={{ background: "var(--admin)" }}></i>
                <span>
                  <b>Switch plans</b> and the new plan starts the day it&apos;s approved.
                </span>
              </div>
              <div className="rule">
                <i style={{ background: "#d97706" }}></i>
                <span>
                  <b>Reminders</b> are emailed 5 days and 1 day before your plan ends.
                </span>
              </div>
              <div className="rule">
                <i style={{ background: "var(--ah)" }}></i>
                <span>
                  <b>If it ends</b>, you move to the free plan and partner accounts pause. Your data stays, and renewing brings
                  accounts back.
                </span>
              </div>
            </div>
          </div>
          <div className="pflow">
            <div className="pstep">
              <span style={{ background: "var(--admin)" }}>1</span>
              <div>
                <h4>Pick a duration and plan</h4>
                <p>Choose how many months to pay for. Longer durations get their discount straight away.</p>
              </div>
            </div>
            <div className="pstep">
              <span style={{ background: "var(--ah)" }}>2</span>
              <div>
                <h4>Pay and upload the receipt</h4>
                <p>Transfer the total shown, then upload a photo or PDF of the receipt. One payment can be pending at a time.</p>
              </div>
            </div>
            <div className="pstep">
              <span style={{ background: "var(--so)" }}>3</span>
              <div>
                <h4>We approve it</h4>
                <p>
                  Our team checks the payment and activates your plan. You&apos;ll see the new end date on your Subscription page.
                </p>
              </div>
            </div>
            <div className="pstep">
              <span style={{ background: "var(--tpl)" }}>4</span>
              <div>
                <h4>Invite more partners</h4>
                <p>Your new account limits apply immediately, so you can send invites right away.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Faq id="faq" title="Pricing questions" items={FAQ} />
      <CtaBox
        title="Start on the free plan today"
        text="Every feature included. Upgrade when you add more partners."
        secondary={{ href: "/contact", label: "Talk to us" }}
      />
    </div>
  );
}
