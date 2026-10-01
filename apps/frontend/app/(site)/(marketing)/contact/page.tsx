import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/site/ContactForm";
import CopyEmail from "@/components/site/CopyEmail";
import { getSiteSettings } from "@/lib/siteSettings";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about plans, setting up your partners or an invoice? We reply within one working day.",
};

const channels = (helloEmail: string | null, supportEmail: string | null) => [
  {
    label: "Sales and general",
    email: helloEmail,
    bg: "var(--admin-bg)",
    color: "var(--admin)",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
  },
  {
    label: "Support and billing",
    email: supportEmail,
    bg: "var(--tpl-bg)",
    color: "var(--tpl)",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" />
      </>
    ),
  },
].filter((c): c is typeof c & { email: string } => Boolean(c.email));


const ROUTES = [
  { href: "/how-it-works", title: "How it works", text: "Set-up, orders, shipping and invoicing, step by step.", go: "Read the guide →", bg: "var(--ah-bg)", color: "var(--ah)", path: "M4 6h16M4 12h10M4 18h7" },
  { href: "/pricing", title: "Pricing", text: "Plans, account limits and how paying by bank transfer works.", go: "Compare plans →", bg: "var(--so-bg)", color: "var(--so)", path: "M20 12 12 20 4 12V4h8z" },
  { href: "/#faq", title: "Common questions", text: "eBay connection, currencies, partner logins and more.", go: "See answers →", bg: "var(--tpl-bg)", color: "var(--tpl)", path: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" },
];

export default async function ContactPage() {
  const site = await getSiteSettings();
  const CHANNELS = channels(site.helloEmail, site.supportEmail);
  return (
    <div className="page-contact">
      <section className="page-hero" style={{ paddingBottom: 48 }}>
        <div className="wrap">
          <span className="eyebrow">
            <i>
              <b style={{ background: "var(--ah)" }} />
              <b style={{ background: "var(--so)" }} />
              <b style={{ background: "var(--tpl)" }} />
            </i>
            Contact
          </span>
          <h1>Talk to a person, not a bot</h1>
          <p className="lead">
            Questions about plans, setting up your partners or an invoice that doesn&apos;t look right? Send us a message and we&apos;ll
            reply within one working day.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: 96 }}>
        <div className="wrap">
          <div className="contact">
            <ContactForm />
            <aside className="side">
              {CHANNELS.length > 0 && (
              <div className="box">
                <h3>Email us directly</h3>
                <p>Prefer your own inbox? These go to the same team.</p>
                <div className="chan">
                  {CHANNELS.map((c) => (
                    <div className="ch" key={c.email}>
                      <span className="ic" style={{ background: c.bg, color: c.color }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          {c.icon}
                        </svg>
                      </span>
                      <div>
                        <small>{c.label}</small>
                        <b>{c.email}</b>
                      </div>
                      <CopyEmail email={c.email} />
                    </div>
                  ))}
                </div>
              </div>
              )}
              {site.replyHours.length > 0 && (
              <div className="box">
                <h3>When we reply</h3>
                <div className="hours">
                  {site.replyHours.map((r) => (
                    <div key={r.days}>
                      <span>{r.days}</span>
                      <b>{r.hours}</b>
                    </div>
                  ))}
                </div>
                {site.replyTimezone && (
                  <span className="status">
                    <i />
                    {site.replyTimezone}
                  </span>
                )}
              </div>
              )}
              <div className="box dark">
                <h3>Already using {site.brandName}?</h3>
                <p>Log in and tell us your company name in the message. We can find your orders and invoices faster.</p>
                <Link className="btn btn-sm" href="/login">
                  Log in
                </Link>
              </div>
            </aside>
          </div>

          <div className="routes">
            {ROUTES.map((r) => (
              <Link className="route" href={r.href} key={r.href}>
                <span className="ic" style={{ background: r.bg, color: r.color }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d={r.path} />
                  </svg>
                </span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
                <span className="go">{r.go}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
