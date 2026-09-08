"use client";

import type { InvoiceDto, Role } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { generateInvoice, getToken, listInvoices, listUsers, markInvoicePaid } from "@/lib/api";

interface UserOption {
  id: string;
  email: string;
  roles: Role[];
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("ACCOUNT_HOLDER" as Role);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    listUsers().then(setUsers as never).catch(() => undefined);
  }, [router]);

  const selectedUser = users.find((u) => u.id === userId);
  const availableRoles = selectedUser?.roles.filter((r) => r !== "ADMIN") ?? [];

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await generateInvoice(userId, role);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleMarkPaid(id: string) {
    await markInvoicePaid(id);
    refresh();
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {error && <p className="mt-4 text-red-600">{error}</p>}

        <form onSubmit={handleGenerate} className="mt-6 flex items-end gap-3 rounded border bg-white p-4 text-sm">
          <label className="flex-1">
            User
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1">
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
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 w-full rounded border px-2 py-1">
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!userId} className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
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
      </main>
    </>
  );
}
