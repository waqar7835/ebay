"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/api";
import BrandLogo from "./BrandLogo";

const LINKS = [
  { href: "/", label: "Home", match: "/" },
  { href: "/how-it-works", label: "How it works", match: "/how-it-works" },
  { href: "/pricing", label: "Pricing", match: "/pricing" },
  { href: "/contact", label: "Contact", match: "/contact" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => setLoggedIn(Boolean(getToken())), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header>
      <div className="wrap">
        <nav className={`nav${open ? " open" : ""}`} aria-label="Main">
          <BrandLogo />
          <ul id="site-nav-links">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={l.match && pathname === l.match ? "page" : undefined}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="act">
            {loggedIn ? (
              <Link className="btn btn-dark btn-sm" href="/dashboard">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link className="login" href="/login">
                  Log in
                </Link>
                <Link className="btn btn-dark btn-sm" href="/register">
                  Start free
                </Link>
              </>
            )}
            <button
              className="menu-btn"
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="site-nav-links"
              onClick={() => setOpen((o) => !o)}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="#151827" strokeWidth="2" aria-hidden>
                {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
              </svg>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
