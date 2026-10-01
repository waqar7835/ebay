"use client";

import Link from "next/link";
import { ROLE_COLORS } from "@/lib/brand";
import { useSiteSettings } from "./SiteSettingsProvider";
import BrandLogo from "./BrandLogo";

type Variant = "login" | "register" | "account";

const SIDE: Record<Variant, { title: string; text: string; points: { color: string; strong: string; rest: string }[] }> = {
  login: {
    title: "Welcome back to your partner portal",
    text: "Pick the role you're logging in as. Each role sees its own orders, earnings and invoices.",
    points: [
      { color: ROLE_COLORS.admin, strong: "Admin and Staff", rest: " run orders, partners and invoices for the company." },
      { color: ROLE_COLORS.accountHolder, strong: "Account Holders", rest: " see their profit share and what they owe." },
      { color: ROLE_COLORS.stockOwner, strong: "Stock Owners", rest: " follow items sold and payouts per item." },
      { color: ROLE_COLORS.threePl, strong: "3PLs", rest: " ship orders, add tracking and bill their fees." },
    ],
  },
  register: {
    title: "Set up your company in two minutes",
    text: "You'll be the company Admin. Once you're in, invite your partners and log your first order.",
    points: [
      { color: "#047857", strong: "Start on the free plan.", rest: " Every feature included. No card needed." },
      { color: ROLE_COLORS.admin, strong: "Every feature on every plan.", rest: " Plans only change how many partners you can add." },
      { color: ROLE_COLORS.stockOwner, strong: "Your Admin account is always free", rest: ", on every plan." },
    ],
  },
  account: {
    title: "Your account, secured",
    text: "Each role has its own login, so partners only ever see their own orders, earnings and invoices.",
    points: [
      { color: ROLE_COLORS.admin, strong: "Passwords", rest: " need at least 8 characters." },
      { color: ROLE_COLORS.threePl, strong: "Reset links", rest: " are sent to the email on your account." },
    ],
  },
};

/** Two-column auth layout: dark brand panel on the left (hidden on small screens), form panel on the right. */
export default function AuthShell({
  variant,
  topLink,
  footNote,
  children,
}: {
  variant: Variant;
  topLink?: { text: string; href: string; label: string };
  footNote?: React.ReactNode;
  children: React.ReactNode;
}) {
  const side = SIDE[variant];
  const { brandName } = useSiteSettings();
  return (
    <div className="auth">
      <aside className="auth-side">
        <BrandLogo />
        <div className="pitch">
          <h2>{side.title}</h2>
          <p>{side.text}</p>
          <ul className="auth-points">
            {side.points.map((p) => (
              <li key={p.strong}>
                <i aria-hidden>
                  <b style={{ background: p.color }} />
                </i>
                <span>
                  <b style={{ color: "#fff" }}>{p.strong}</b>
                  {p.rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mini">
          <span><i style={{ background: "#10b981" }} />Rates locked per order</span>
          <span><i style={{ background: "#f59e0b" }} />Invoices in each partner&apos;s currency</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-top">
          <Link className="back" href="/">
            ← Back to site
          </Link>
          <BrandLogo />
          {topLink && (
            <span className="switch">
              <span>{topLink.text} </span>
              <Link href={topLink.href}>{topLink.label}</Link>
            </span>
          )}
        </div>
        <div className="auth-center">
          <div className="panel">{children}</div>
        </div>
        <div className="auth-foot">
          <span>{footNote ?? `© ${new Date().getFullYear()} ${brandName}`}</span>
          <nav>
            <Link href="/contact">Help</Link>
          </nav>
        </div>
      </main>
    </div>
  );
}

/** Small info card shown under the main auth card. */
export function AuthNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="card note-card">
      <i aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v5h1" />
        </svg>
      </i>
      <span>{children}</span>
    </div>
  );
}

/** Green check / mail circle used on success states. */
export function DoneIcon({ kind = "check" }: { kind?: "check" | "mail" }) {
  return (
    <div className="done-ic" style={{ marginInline: "auto" }} aria-hidden>
      {kind === "check" ? (
        <svg width="30" height="30" viewBox="0 0 20 20" fill="#047857">
          <path d="M8.2 13.4 4.8 10l1.1-1.1 2.3 2.3 5.9-5.9 1.1 1.1z" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      )}
    </div>
  );
}
