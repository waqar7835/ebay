"use client";

import {
  AppstoreOutlined,
  CreditCardOutlined,
  CrownOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  ShoppingCartOutlined,
  SolutionOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Menu, Select } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@ebay-order-management/shared";
import { getSelectedCompanyId, getStoredUser, listAllCompanies, setSelectedCompanyId } from "@/lib/api";
import { searchable } from "@/lib/selectOptions";

/** Each nav item gets its own Aurora tint so the sidebar reads as multicolor. */
function NavIcon({ icon, bg, fg }: { icon: React.ReactNode; bg: string; fg: string }) {
  return (
    <span className="nav-icon" style={{ "--nav-icon-bg": bg, "--nav-icon-fg": fg } as React.CSSProperties}>
      {icon}
    </span>
  );
}

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: <NavIcon icon={<DashboardOutlined />} bg="#dbeafe" fg="#2563eb" /> },
  { href: "/orders", label: "Orders", icon: <NavIcon icon={<ShoppingCartOutlined />} bg="#ede9fe" fg="#7c3aed" /> },
  { href: "/products", label: "Products", icon: <NavIcon icon={<AppstoreOutlined />} bg="#d1fae5" fg="#059669" /> },
  { href: "/users", label: "Users", icon: <NavIcon icon={<TeamOutlined />} bg="#e0f2fe" fg="#0284c7" /> },
  { href: "/invoices", label: "Invoices", icon: <NavIcon icon={<FileTextOutlined />} bg="#fce7f3" fg="#db2777" /> },
  { href: "/subscriptions", label: "Subscriptions", icon: <NavIcon icon={<CreditCardOutlined />} bg="#fef3c7" fg="#d97706" /> },
];

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; roles: Role[] } | null>(null);
  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN" as Role);
  const isPlatformStaff = user?.roles.includes("PLATFORM_STAFF" as Role);
  const isBackofficeRealm = isSuperAdmin || isPlatformStaff;

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    if (!isBackofficeRealm) return;
    setSelected(getSelectedCompanyId() ?? "");
    listAllCompanies()
      .then(setCompanies)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBackofficeRealm]);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedCompanyId");
    router.push("/");
  }

  function handleCompanyChange(id: string) {
    setSelected(id);
    setSelectedCompanyId(id);
    window.location.reload();
  }

  const menuLinks = [
    ...LINKS,
    ...(isSuperAdmin
      ? [
          { href: "/super-admin", label: "Super Admin", icon: <NavIcon icon={<CrownOutlined />} bg="#ccfbf1" fg="#0d9488" /> },
          { href: "/platform-staff", label: "Platform Staff", icon: <NavIcon icon={<SolutionOutlined />} bg="#e0e7ff" fg="#4f46e5" /> },
        ]
      : []),
  ];
  const selectedKey = menuLinks.find((link) => pathname?.startsWith(link.href))?.href;

  return (
    <nav className="app-sider fixed inset-y-0 left-0 z-10 flex w-56 flex-col py-5">
      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-4 flex items-center gap-2 px-4">
          <span className="app-logo grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white">OM</span>
          <span className="text-sm font-bold text-slate-800">eBay Order Mgmt</span>
        </div>
        <Menu
          mode="inline"
          className="border-e-0"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={menuLinks.map((link) => ({ key: link.href, icon: link.icon, label: <Link href={link.href}>{link.label}</Link> }))}
        />
        {isBackofficeRealm && (
          <div className="mt-6 border-t border-white/70 px-2 pt-4">
            <label className="text-xs uppercase tracking-wide text-slate-500">Viewing company</label>
            <Select
              showSearch={searchable}
              placeholder="Select a company…"
              value={selected || undefined}
              onChange={(v) => handleCompanyChange(v)}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              className="mt-1 w-full"
            />
          </div>
        )}
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
