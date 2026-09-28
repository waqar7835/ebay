"use client";

import { LogoutOutlined } from "@ant-design/icons";
import { Button, Menu, Select } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@ebay-order-management/shared";
import { getSelectedCompanyId, getStoredUser, listAllCompanies, setSelectedCompanyId } from "@/lib/api";
import { searchable } from "@/lib/selectOptions";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/users", label: "Users" },
  { href: "/invoices", label: "Invoices" },
  { href: "/billing", label: "Billing" },
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
          { href: "/super-admin", label: "Super Admin" },
          { href: "/platform-staff", label: "Platform Staff" },
        ]
      : []),
  ];
  const selectedKey = menuLinks.find((link) => pathname?.startsWith(link.href))?.href;

  return (
    <nav className="fixed inset-y-0 left-0 z-10 flex w-56 flex-col border-r bg-white py-5">
      <div className="flex-1 overflow-y-auto px-2">
        <p className="mb-4 px-4 text-sm font-semibold text-gray-900">eBay Order Mgmt</p>
        <Menu
          mode="inline"
          className="border-e-0"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={menuLinks.map((link) => ({ key: link.href, label: <Link href={link.href}>{link.label}</Link> }))}
        />
        {isBackofficeRealm && (
          <div className="mt-6 border-t px-2 pt-4">
            <label className="text-xs uppercase tracking-wide text-gray-400">Viewing company</label>
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
      <div className="shrink-0 border-t px-4 pt-4 text-xs text-gray-500">
        <p className="truncate px-2 pb-2">{user?.email}</p>
        <Button block icon={<LogoutOutlined />} onClick={logout}>
          Log out
        </Button>
      </div>
    </nav>
  );
}
