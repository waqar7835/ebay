"use client";

import type { ProductFulfillmentType, UserDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, getUser, updateThreePlProfile } from "@/lib/api";

export default function EditThreePlUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<UserDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fulfillmentType, setFulfillmentType] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);
  const [payoutPerOrder, setPayoutPerOrder] = useState("0");
  const [billingCycleStartDay, setBillingCycleStartDay] = useState("1");

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    getUser(userId)
      .then((u) => {
        if (!u.roles.includes("THREE_PL" as never) || !u.threePlProfile) {
          setLoadError("This user is not a 3PL");
          return;
        }
        setUser(u);
        setFulfillmentType(u.threePlProfile.fulfillmentType);
        setPayoutPerOrder(String(u.threePlProfile.payoutPerOrder));
        setBillingCycleStartDay(String(u.threePlProfile.billingCycleStartDay));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load user"));
  }, [router, userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await updateThreePlProfile(userId, {
        fulfillmentType,
        payoutPerOrder: Number(payoutPerOrder),
        billingCycleStartDay: Number(billingCycleStartDay),
      });
      router.push("/users");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save 3PL settings");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-2xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit 3PL settings</h1>
          <button onClick={() => router.push("/users")} className="rounded border px-3 py-2 text-sm">
            Back to users
          </button>
        </div>

        {loadError && <p className="mt-4 text-red-600">{loadError}</p>}

        {user && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border bg-white p-4 text-sm">
            <p className="text-gray-600">{user.name || user.email}</p>

            <div className="flex gap-3">
              <label className="flex-1">
                Type
                <select
                  value={fulfillmentType}
                  onChange={(e) => setFulfillmentType(e.target.value as ProductFulfillmentType)}
                  className="mt-1 w-full rounded border px-2 py-1"
                >
                  <option value="STOCK">Stock</option>
                  <option value="DROPSHIP">Dropshipping</option>
                </select>
              </label>
              <label className="flex-1">
                Payout per order fulfilled
                <input
                  value={payoutPerOrder}
                  onChange={(e) => setPayoutPerOrder(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>

            <label>
              Billing cycle start day (1–28)
              <input
                value={billingCycleStartDay}
                onChange={(e) => setBillingCycleStartDay(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>

            {formError && <p className="text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 self-start rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-70"
            >
              {submitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
