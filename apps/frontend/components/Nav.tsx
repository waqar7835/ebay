"use client";

import {
  AppstoreOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LogoutOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Menu } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CompanyDto, Role } from "@ebay-order-management/shared";
import { getMyCompany, getStoredUser, getToken, mediaUrl, type StoredUser } from "@/lib/api";

const COMPANY_CACHE_KEY = "navCompany";
type NavCompany = Pick<CompanyDto, "name" | "logoUrl">;

/** "Alpha Drop" → "AD"; single word → first two letters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

function readCachedCompany(): NavCompany | null {
  try {
    const raw = localStorage.getItem(COMPANY_CACHE_KEY);
    return raw ? (JSON.parse(raw) as NavCompany) : null;
  } catch {
    return null;
  }
}

/** Each nav item gets its own Aurora tint so the sidebar reads as multicolor. */
function NavIcon({ icon, bg, fg }: { icon: React.ReactNode; bg: string; fg: string }) {
  return (
    <span className="nav-icon" style={{ "--nav-icon-bg": bg, "--nav-icon-fg": fg } as React.CSSProperties}>
      {icon}
    </span>
  );
}

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [company, setCompany] = useState<NavCompany | null>(null);

  // The sidebar header shows the user's company (logo + name). Cached so it doesn't flash on every page change.
  useEffect(() => {
    setUser(getStoredUser());
    setCompany(readCachedCompany());
    if (!getToken()) return;
    getMyCompany()
      .then((c) => {
        const next = { name: c.name, logoUrl: c.logoUrl };
        setCompany(next);
        localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);
  }, []);

  const isAdmin = user?.roles.includes("ADMIN" as Role) ?? false;
  const perms = user?.staffPermissions;
  const isStockOwner = user?.roles.includes("STOCK_OWNER" as Role) ?? false;

  const links = [
    { href: "/dashboard", label: "Dashboard", show: true, icon: <NavIcon icon={<DashboardOutlined />} bg="#dbeafe" fg="#2563eb" /> },
    { href: "/products", label: "Products", show: isAdmin || !!perms?.canManageStock || isStockOwner, icon: <NavIcon icon={<AppstoreOutlined />} bg="#d1fae5" fg="#059669" /> },
    { href: "/orders", label: "Orders", show: true, icon: <NavIcon icon={<ShoppingCartOutlined />} bg="#ede9fe" fg="#7c3aed" /> },
    { href: "/users", label: "Users", show: isAdmin || !!perms?.canManageUsers, icon: <NavIcon icon={<TeamOutlined />} bg="#e0f2fe" fg="#0284c7" /> },
    { href: "/invoices", label: "Invoices", show: true, icon: <NavIcon icon={<FileTextOutlined />} bg="#fce7f3" fg="#db2777" /> },
    { href: "/subscription", label: "Subscription", show: isAdmin || !!perms?.canManageUsers, icon: <NavIcon icon={<CreditCardOutlined />} bg="#fef3c7" fg="#d97706" /> },
    { href: "/profile", label: "Profile", show: true, icon: <NavIcon icon={<IdcardOutlined />} bg="#ccfbf1" fg="#0d9488" /> },
  ].filter((link) => link.show);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem(COMPANY_CACHE_KEY);
    router.push("/login");
  }

  const selectedKey = links.find((link) => pathname?.startsWith(link.href))?.href;

  return (
    <nav className="app-sider fixed inset-y-0 left-0 z-10 flex w-56 flex-col py-5">
      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-4 flex items-center gap-2 px-4">
          {company?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(company.logoUrl)} alt="" className="h-7 w-7 shrink-0 rounded-lg bg-white object-contain" />
          ) : (
            <span className="app-logo grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white">
              {company ? initials(company.name) : ""}
            </span>
          )}
          <span className="truncate text-sm font-bold text-slate-800" title={company?.name}>
            {company?.name ?? ""}
          </span>
        </div>
        <Menu
          mode="inline"
          className="border-e-0"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={links.map((link) => ({ key: link.href, icon: link.icon, label: <Link href={link.href}>{link.label}</Link> }))}
        />
      </div>
      <div className="shrink-0 border-t border-white/70 px-4 pt-4 text-xs text-slate-500">
        <p className="truncate px-2 pb-2">{user?.email}</p>
        <Button block icon={<LogoutOutlined />} onClick={logout}>
          Log out
        </Button>
      </div>
    </nav>
  );
}
