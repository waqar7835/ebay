"use client";

import { LogoutOutlined } from "@ant-design/icons";
import { Button, Menu } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@ebay-order-management/shared";
import { getStoredUser, type StoredUser } from "@/lib/api";

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
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/products", label: "Products", show: isAdmin || !!perms?.canManageStock },
    { href: "/orders", label: "Orders", show: isAdmin || !!perms?.canManageOrders },
    { href: "/users", label: "Users", show: isAdmin || !!perms?.canManageUsers },
    { href: "/invoices", label: "Invoices", show: true },
    { href: "/billing", label: "Billing", show: isAdmin || !!perms?.canManageUsers },
    { href: "/profile", label: "Profile", show: true },
  ].filter((link) => link.show);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    router.push("/");
  }

  const selectedKey = links.find((link) => pathname?.startsWith(link.href))?.href;

  return (
    <nav className="fixed inset-y-0 left-0 z-10 flex w-56 flex-col border-r bg-white py-5">
      <div className="flex-1 overflow-y-auto px-2">
        <p className="mb-4 px-4 text-sm font-semibold text-gray-900">Partner Portal</p>
        <Menu
          mode="inline"
          className="border-e-0"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={links.map((link) => ({ key: link.href, label: <Link href={link.href}>{link.label}</Link> }))}
        />
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
