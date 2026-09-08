"use client";

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
  ].filter((link) => link.show);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    router.push("/");
  }

  return (
    <nav className="fixed inset-y-0 left-0 z-10 flex w-56 flex-col border-r bg-white py-5">
      <div className="flex-1 overflow-y-auto px-4">
        <p className="mb-6 px-2 text-sm font-semibold text-gray-900">Partner Portal</p>
        <div className="flex flex-col gap-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded px-2 py-2 hover:bg-gray-100 ${
                pathname?.startsWith(link.href) ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t px-4 pt-4 text-xs text-gray-500">
        <p className="truncate px-2 pb-2">{user?.email}</p>
        <button onClick={logout} className="w-full rounded border px-2 py-1.5 text-gray-700 hover:bg-gray-50">
          Log out
        </button>
      </div>
    </nav>
  );
}
