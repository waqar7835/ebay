"use client";

import { useState } from "react";
import { ROLE_COLORS } from "@/lib/brand";

interface RoleView {
  key: string;
  label: string;
  color: string;
  bg: string;
  title: string;
  text: string;
  points: string[];
  cards: [string, string][];
  rows: [string, string][];
}

/** Example numbers only: shows what each role's portal focuses on. */
const ROLES: RoleView[] = [
  {
    key: "ah",
    label: "Account Holder",
    color: ROLE_COLORS.accountHolder,
    bg: "#fff1ee",
    title: "Know your share before you ask",
    text: "See every order on your eBay account and what you owe the company, in your own currency.",
    points: ["Profit share per order", "Invoices in your currency", "Shipping label reimbursements shown clearly"],
    cards: [["Orders", "42"], ["Your share", "£874.20"], ["Balance due", "£1,312.40"]],
    rows: [["24-11873-90412", "£20.80"], ["24-11873-90377", "£11.40"], ["24-11873-90351", "£32.15"]],
  },
  {
    key: "so",
    label: "Stock Owner",
    color: ROLE_COLORS.stockOwner,
    bg: "#f7eeff",
    title: "Paid per item, even on shared orders",
    text: "Track which of your products sold and what each one earned, with profit share or a fixed price.",
    points: ["Payout per item you supplied", "Your items only, even on mixed orders", "Clear cost and profit breakdown"],
    cards: [["Items sold", "118"], ["Payout", "₨ 486,300"], ["Paid", "₨ 402,000"]],
    rows: [["Air fryer × 2", "₨ 18,890"], ["Stand mixer", "₨ 21,400"], ["Kettle × 3", "₨ 9,060"]],
  },
  {
    key: "tpl",
    label: "3PL",
    color: ROLE_COLORS.threePl,
    bg: "#e8f9fc",
    title: "Ship, track and invoice from one list",
    text: "See the orders assigned to your warehouse, add tracking numbers and bill your fees.",
    points: ["One fee per order, not per item", "Dropship purchases reimbursed", "Fulfillment invoices built for you"],
    cards: [["To ship", "9"], ["Shipped", "64"], ["Fees", "₨ 96,000"]],
    rows: [["24-11873-90351 · Pending", "Add tracking"], ["24-11873-90377 · Shipped", "RM 4412 9921"], ["24-11873-90298 · Delivered", "RM 4412 8170"]],
  },
  {
    key: "admin",
    label: "Admin",
    color: ROLE_COLORS.admin,
    bg: "#eaf2ff",
    title: "The whole business on one screen",
    text: "Orders, partner payouts, company profit and invoices across every account you run.",
    points: ["Company profit from every source", "Approve invoices in a few clicks", "Staff permissions you control"],
    cards: [["Orders", "186"], ["Profit", "₨ 357,300"], ["Owed", "₨ 268,140"]],
    rows: [["Invoice AD-2026-007", "Approved"], ["3 orders stuck 3+ days", "Review"], ["New Stock Owner invite", "Accepted"]],
  },
];

export default function RoleSwitcher() {
  const [active, setActive] = useState(ROLES[0].key);
  const r = ROLES.find((x) => x.key === active)!;

  return (
    <div className="switch">
      <div className="tabs" role="tablist" aria-label="Choose a role">
        {ROLES.map((x) => (
          <button
            key={x.key}
            type="button"
            className="tab"
            role="tab"
            id={`role-tab-${x.key}`}
            aria-selected={x.key === active}
            aria-controls="role-panel"
            onClick={() => setActive(x.key)}
          >
            <i style={{ background: x.color }} />
            {x.label}
          </button>
        ))}
      </div>
      <div
        className="panel"
        id="role-panel"
        role="tabpanel"
        aria-labelledby={`role-tab-${r.key}`}
        style={{ "--c": r.color, "--cbg": r.bg } as React.CSSProperties}
      >
        <div>
          <span className="who" style={{ color: r.color }}>
            {r.label}
          </span>
          <h3 style={{ marginTop: 8 }}>{r.title}</h3>
          <p>{r.text}</p>
          <ul>
            {r.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="view">
          <div className="vcards">
            {r.cards.map(([k, v]) => (
              <div className="vc" key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="vlist">
            {r.rows.map(([k, v]) => (
              <div className="vrow" key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
