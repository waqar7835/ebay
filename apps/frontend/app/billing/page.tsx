"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, listSeatOrders, listUsers, previewSeatCharge, submitSeatOrder } from "@/lib/api";

interface UserOption {
  id: string;
  email: string;
  roles: string[];
}

export default function BillingPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [months, setMonths] = useState("1");
  const [preview, setPreview] = useState<{ amount: number; periodStart: string; periodEnd: string } | null>(null);
  const [referenceNote, setReferenceNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    listSeatOrders()
      .then(setOrders)
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

  const paidRoleUsers = users.filter((u) => u.roles.some((r) => ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"].includes(r)));

  async function handlePreview() {
    if (!userId) return;
    try {
      const result = await previewSeatCharge(userId, Number(months));
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview charge");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await submitSeatOrder([{ userId, months: Number(months) }], referenceNote, receipt);
      setMessage("Seat payment order submitted for Super Admin review.");
      setPreview(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit payment order");
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Seat Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Account Holder, Stock Owner, and 3PL seats require payment. Submit a payment order with your receipt for
          the Super Admin to review.
        </p>
        {error && <p className="mt-4 text-red-600">{error}</p>}
        {message && <p className="mt-4 text-green-700">{message}</p>}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border bg-white p-4 text-sm">
          <div className="flex gap-3">
            <label className="flex-1">
              Seat
              <select required value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1">
                <option value="">Select…</option>
                {paidRoleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.roles.join(", ")})
                  </option>
                ))}
              </select>
            </label>
            <label className="w-32">
              Months
              <input value={months} onChange={(e) => setMonths(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            <button type="button" onClick={handlePreview} className="self-end rounded border px-3 py-1">
              Preview
            </button>
          </div>

          {preview && (
            <p className="text-sm text-gray-600">
              Period {new Date(preview.periodStart).toLocaleDateString()} – {new Date(preview.periodEnd).toLocaleDateString()}: $
              {preview.amount.toFixed(2)}
            </p>
          )}

          <input placeholder="Reference note (optional)" value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} className="rounded border px-2 py-1" />
          <label className="text-sm">
            Receipt
            <input type="file" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="mt-1 block" />
          </label>

          <button type="submit" disabled={!userId} className="self-start rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
            Submit payment order
          </button>
        </form>

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Submitted</th>
              <th className="py-2">Total</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.id} className="border-b">
                <td className="py-2">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="py-2">${Number(o.totalAmount).toFixed(2)}</td>
                <td className="py-2">{o.status}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-gray-500">
                  No seat payment orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
