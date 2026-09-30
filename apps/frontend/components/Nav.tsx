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
import type { Role } from "@ebay-order-management/shared";
import { getStoredUser, type StoredUser } from "@/lib/api";

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

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const isAdmin = user?.roles.includes("ADMIN" as Role) ?? false;
  const perms = user?.staffPermissions;

  const links = [
    { href: "/dashboard", label: "Dashboard", show: true, icon: <NavIcon icon={<DashboardOutlined />} bg="#dbeafe" fg="#2563eb" /> },
    { href: "/products", label: "Products", show: isAdmin || !!perms?.canManageStock, icon: <NavIcon icon={<AppstoreOutlined />} bg="#d1fae5" fg="#059669" /> },
    { href: "/orders", label: "Orders", show: isAdmin || !!perms?.canManageOrders, icon: <NavIcon icon={<ShoppingCartOutlined />} bg="#ede9fe" fg="#7c3aed" /> },
    { href: "/users", label: "Users", show: isAdmin || !!perms?.canManageUsers, icon: <NavIcon icon={<TeamOutlined />} bg="#e0f2fe" fg="#0284c7" /> },
    { href: "/invoices", label: "Invoices", show: true, icon: <NavIcon icon={<FileTextOutlined />} bg="#fce7f3" fg="#db2777" /> },
    { href: "/subscription", label: "Subscription", show: isAdmin || !!perms?.canManageUsers, icon: <NavIcon icon={<CreditCardOutlined />} bg="#fef3c7" fg="#d97706" /> },
    { href: "/profile", label: "Profile", show: true, icon: <NavIcon icon={<IdcardOutlined />} bg="#ccfbf1" fg="#0d9488" /> },
  ].filter((link) => link.show);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    router.push("/");
  }

  const selectedKey = links.find((link) => pathname?.startsWith(link.href))?.href;

  return (
    <nav className="app-sider fixed inset-y-0 left-0 z-10 flex w-56 flex-col py-5">
      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-4 flex items-center gap-2 px-4">
          <span className="app-logo grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white">OM</span>
          <span className="text-sm font-bold text-slate-800">Partner Portal</span>
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
