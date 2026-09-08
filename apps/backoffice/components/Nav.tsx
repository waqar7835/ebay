"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@ebay-order-management/shared";
import { getSelectedCompanyId, getStoredUser, listAllCompanies, setSelectedCompanyId } from "@/lib/api";

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

  return (
    <nav className="fixed inset-y-0 left-0 z-10 flex w-56 flex-col border-r bg-white py-5">
      <div className="flex-1 overflow-y-auto px-4">
        <p className="mb-6 px-2 text-sm font-semibold text-gray-900">eBay Order Mgmt</p>
        <div className="flex flex-col gap-1 text-sm">
          {LINKS.map((link) => (
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
          {isSuperAdmin && (
            <Link
              href="/super-admin"
              className={`rounded px-2 py-2 hover:bg-gray-100 ${
                pathname?.startsWith("/super-admin") ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700"
              }`}
            >
              Super Admin
            </Link>
          )}
          {isSuperAdmin && (
            <Link
              href="/platform-staff"
              className={`rounded px-2 py-2 hover:bg-gray-100 ${
                pathname?.startsWith("/platform-staff") ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700"
              }`}
            >
              Platform Staff
            </Link>
          )}
        </div>
        {isBackofficeRealm && (
          <div className="mt-6 border-t pt-4">
            <label className="px-2 text-xs uppercase tracking-wide text-gray-400">Viewing company</label>
            <select
              value={selected}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm text-gray-700"
            >
              <option value="">Select a company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
