"use client";

import type { InvoiceDto, Role } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  generateInvoice,
  generateMyInvoice,
  getStoredUser,
  getToken,
  listInvoices,
  listMyInvoices,
  listUsers,
  markInvoicePaid,
} from "@/lib/api";

const EARNER_ROLES: Role[] = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as Role[];

interface UserOption {
  id: string;
  email: string;
  roles: Role[];
}

export default function InvoicesPage() {
  const router = useRouter();
  const user = getStoredUser();

  // --- self-service: my own invoices ---
  const [myInvoices, setMyInvoices] = useState<InvoiceDto[]>([]);
  const [role, setRole] = useState<Role>((user?.roles.find((r) => EARNER_ROLES.includes(r)) ?? "ACCOUNT_HOLDER") as Role);
  const [myError, setMyError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const myRoles = user?.roles.filter((r) => EARNER_ROLES.includes(r)) ?? [];

  // --- admin view: company-wide invoices ---
  const isAdmin = user?.roles.includes("ADMIN" as Role) ?? false;
  const canManageInvoices = isAdmin || !!user?.staffPermissions?.canGenerateInvoices || !!user?.staffPermissions?.canViewFinancials;
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [genUserId, setGenUserId] = useState("");
  const [genRole, setGenRole] = useState<Role>("ACCOUNT_HOLDER" as Role);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function refreshMine() {
    if (!user) return;
    listMyInvoices(user.id)
      .then(setMyInvoices)
      .catch((err) => setMyError(err instanceof Error ? err.message : "Failed to load"));
  }

  function refreshAdmin() {
    if (!canManageInvoices) return;
    listInvoices()
      .then(setInvoices)
      .catch((err) => setAdminError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refreshMine();
    refreshAdmin();
    if (canManageInvoices) {
      listUsers().then(setUsers as never).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const selectedUser = users.find((u) => u.id === genUserId);
  const availableRoles = selectedUser?.roles.filter((r) => r !== ("ADMIN" as Role)) ?? [];

  async function handleGenerateMine() {
    if (!user) return;
    setMyError(null);
    setMessage(null);
    try {
      await generateMyInvoice(user.id, role);
      setMessage("Invoice generated.");
      refreshMine();
    } catch (err) {
      setMyError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleGenerateForUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await generateInvoice(genUserId, genRole);
      refreshAdmin();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleMarkPaid(id: string) {
    await markInvoicePaid(id);
    refreshAdmin();
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">My Invoices</h1>

        {myRoles.length > 0 && (
          <div className="mt-6 flex items-end gap-3 rounded border bg-white p-4 text-sm">
            {myRoles.length > 1 && (
              <label>
                Role
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 block rounded border px-2 py-1">
                  {myRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={handleGenerateMine} className="rounded bg-gray-900 px-3 py-2 text-white">
              Generate invoice for last completed cycle
            </button>
          </div>
        )}

        {myError && <p className="mt-4 text-red-600">{myError}</p>}
        {message && <p className="mt-4 text-green-700">{message}</p>}

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Role</th>
              <th className="py-2">Period</th>
              <th className="py-2">Total</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {myInvoices.map((inv) => (
              <tr key={inv.id} className="border-b">
                <td className="py-2">{inv.role}</td>
                <td className="py-2">
                  {inv.periodStart} – {inv.periodEnd}
                </td>
                <td className="py-2">${inv.totalAmount.toFixed(2)}</td>
                <td className="py-2">{inv.status}</td>
              </tr>
            ))}
            {myInvoices.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-gray-500">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {canManageInvoices && (
          <>
            <h2 className="mt-12 text-xl font-semibold">Company Invoices</h2>
            {adminError && <p className="mt-4 text-red-600">{adminError}</p>}

            <form onSubmit={handleGenerateForUser} className="mt-6 flex items-end gap-3 rounded border bg-white p-4 text-sm">
              <label className="flex-1">
                User
                <select value={genUserId} onChange={(e) => setGenUserId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1">
                  <option value="">Select…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                Role
                <select value={genRole} onChange={(e) => setGenRole(e.target.value as Role)} className="mt-1 w-full rounded border px-2 py-1">
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={!genUserId} className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
                Generate invoice
              </button>
            </form>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}

            <table className="mt-6 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">User</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Period</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b">
                    <td className="py-2">{inv.userId}</td>
                    <td className="py-2">{inv.role}</td>
                    <td className="py-2">
                      {inv.periodStart} – {inv.periodEnd}
                    </td>
                    <td className="py-2">${inv.totalAmount.toFixed(2)}</td>
                    <td className="py-2">{inv.status}</td>
                    <td className="py-2">
                      {inv.status === "UNPAID" && (
                        <button onClick={() => handleMarkPaid(inv.id)} className="text-xs text-gray-600 underline">
                          Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-gray-500">
                      No invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </main>
    </>
  );
}
