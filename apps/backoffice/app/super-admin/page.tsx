"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getStoredUser, getToken, listAllCompanies, listPendingSeatOrders, reviewSeatOrder } from "@/lib/api";

export default function SuperAdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listAllCompanies().then(setCompanies).catch((err) => setError(err.message));
    listPendingSeatOrders().then(setPending).catch((err) => setError(err.message));
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!getToken() || !user?.roles.includes("SUPER_ADMIN" as never)) {
      router.push("/");
      return;
    }
    refresh();
  }, [router]);

  async function handleReview(id: string, approve: boolean) {
    await reviewSeatOrder(id, approve);
    refresh();
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-5xl p-8">
        <h1 className="text-2xl font-semibold">Super Admin</h1>
        {error && <p className="mt-4 text-red-600">{error}</p>}

        <h2 className="mt-8 text-lg font-medium">Pending seat payment orders</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Company</th>
              <th className="py-2">Submitted</th>
              <th className="py-2">Total</th>
              <th className="py-2">Receipt</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((o: any) => (
              <tr key={o.id} className="border-b">
                <td className="py-2">{o.companyId}</td>
                <td className="py-2">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="py-2">${Number(o.totalAmount).toFixed(2)}</td>
                <td className="py-2">
                  {o.receiptFileUrl ? (
                    <a href={`${process.env.NEXT_PUBLIC_API_URL}${o.receiptFileUrl}`} target="_blank" rel="noreferrer" className="underline">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="flex gap-2 py-2">
                  <button onClick={() => handleReview(o.id, true)} className="rounded bg-green-600 px-2 py-1 text-xs text-white">
                    Approve
                  </button>
                  <button onClick={() => handleReview(o.id, false)} className="rounded bg-red-600 px-2 py-1 text-xs text-white">
                    Reject
                  </button>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-gray-500">
                  Nothing pending review.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mt-8 text-lg font-medium">All companies</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Verified</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c: any) => (
              <tr key={c.id} className="border-b">
                <td className="py-2">{c.name}</td>
                <td className="py-2">{c.emailVerifiedAt ? "Yes" : "No"}</td>
                <td className="py-2">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
