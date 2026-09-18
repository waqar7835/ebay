"use client";

import type { ProductFulfillmentType, Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, inviteUser } from "@/lib/api";

const USER_TYPES: { role: Role; label: string; description: string }[] = [
  { role: "STAFF" as Role, label: "Staff", description: "An employee who manages orders, stock, users or invoices on your behalf." },
  { role: "ACCOUNT_HOLDER" as Role, label: "Account Holder", description: "Earns a share of profit and is billed on a recurring cycle." },
  { role: "STOCK_OWNER" as Role, label: "Stock Owner", description: "Supplies stock and is paid a fixed amount or a share of margin." },
  { role: "THREE_PL" as Role, label: "3PL", description: "A fulfillment partner paid per order fulfilled." },
];

const STAFF_PERMISSIONS = [
  { key: "canManageOrders", label: "Manage orders" },
  { key: "canManageStock", label: "Manage stock" },
  { key: "canManageUsers", label: "Manage users" },
  { key: "canGenerateInvoices", label: "Generate invoices" },
  { key: "canViewFinancials", label: "View financials" },
] as const;

type StaffPermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];
type StaffPermissionsState = Record<StaffPermissionKey, boolean>;

const DEFAULT_STAFF_PERMISSIONS: StaffPermissionsState = {
  canManageOrders: false,
  canManageStock: false,
  canManageUsers: false,
  canGenerateInvoices: false,
  canViewFinancials: false,
};

export default function InviteUserPage() {
  const router = useRouter();
  const [activeType, setActiveType] = useState<Role>("STAFF" as Role);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [sharePercent, setSharePercent] = useState("20");
  const [threePlPriceCharged, setThreePlPriceCharged] = useState("");
  const [payoutMode, setPayoutMode] = useState<StockOwnerPayoutMode>("FIXED" as StockOwnerPayoutMode);
  const [stockOwnerSharePercent, setStockOwnerSharePercent] = useState("0");
  const [payoutPerOrder, setPayoutPerOrder] = useState("0");
  const [threePlFulfillmentType, setThreePlFulfillmentType] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);
  const [billingCycleStartDay, setBillingCycleStartDay] = useState("1");
  const [staffPermissions, setStaffPermissions] = useState<StaffPermissionsState>(DEFAULT_STAFF_PERMISSIONS);
  const [hasRevenueShare, setHasRevenueShare] = useState(false);
  const [staffSharePercent, setStaffSharePercent] = useState("0");

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
    }
  }, [router]);

  function switchType(role: Role) {
    setActiveType(role);
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      await inviteUser({
        name: name || undefined,
        email,
        roles: [activeType],
        staffPermissions:
          activeType === ("STAFF" as Role)
            ? {
                ...staffPermissions,
                hasRevenueShare,
                sharePercent: hasRevenueShare ? Number(staffSharePercent) : null,
              }
            : undefined,
        accountHolderProfile:
          activeType === ("ACCOUNT_HOLDER" as Role)
            ? {
                sharePercent: Number(sharePercent),
                threePlPriceCharged: threePlPriceCharged ? Number(threePlPriceCharged) : null,
                billingCycleStartDay: Number(billingCycleStartDay),
              }
            : undefined,
        stockOwnerProfile:
          activeType === ("STOCK_OWNER" as Role)
            ? {
                payoutMode,
                sharePercent: payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) ? Number(stockOwnerSharePercent) : null,
                billingCycleStartDay: Number(billingCycleStartDay),
              }
            : undefined,
        threePlProfile:
          activeType === ("THREE_PL" as Role)
            ? {
                payoutPerOrder: Number(payoutPerOrder),
                billingCycleStartDay: Number(billingCycleStartDay),
                fulfillmentType: threePlFulfillmentType,
              }
            : undefined,
      });
      const label = USER_TYPES.find((t) => t.role === activeType)?.label ?? activeType;
      setSuccessMessage(`Invited ${email} as ${label}. Switch tabs above to invite the same person for another user type.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  const activeMeta = USER_TYPES.find((t) => t.role === activeType)!;

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Invite user</h1>
          <button onClick={() => router.push("/users")} className="rounded border px-3 py-2 text-sm">
            Back to users
          </button>
        </div>

        <div className="mt-6 flex gap-1 border-b">
          {USER_TYPES.map(({ role, label }) => (
            <button
              key={role}
              type="button"
              disabled={submitting}
              onClick={() => switchType(role)}
              className={`px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                activeType === role
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">{activeMeta.description}</p>

        <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-4 rounded border bg-white p-4">
          <div className="flex gap-3">
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded border px-3 py-2" />
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded border px-3 py-2"
            />
          </div>

          {activeType === ("STAFF" as Role) && (
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium">Permissions</p>
              <div className="grid grid-cols-2 gap-2">
                {STAFF_PERMISSIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={staffPermissions[key]}
                      onChange={(e) => setStaffPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={hasRevenueShare} onChange={(e) => setHasRevenueShare(e.target.checked)} />
                  Revenue share
                </label>
                {hasRevenueShare && (
                  <label className="flex items-center gap-2">
                    Share %
                    <input
                      value={staffSharePercent}
                      onChange={(e) => setStaffSharePercent(e.target.value)}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {activeType === ("ACCOUNT_HOLDER" as Role) && (
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium">Account Holder settings</p>
              <div className="flex gap-3">
                <label className="flex-1">
                  Share % of profit
                  <input value={sharePercent} onChange={(e) => setSharePercent(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
                <label className="flex-1">
                  3PL price charged (optional)
                  <input
                    value={threePlPriceCharged}
                    onChange={(e) => setThreePlPriceCharged(e.target.value)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </label>
              </div>
              <label className="mt-3 block">
                Billing cycle start day (1–28)
                <input
                  value={billingCycleStartDay}
                  onChange={(e) => setBillingCycleStartDay(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
          )}

          {activeType === ("STOCK_OWNER" as Role) && (
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium">Stock Owner settings</p>
              <div className="flex gap-3">
                <label className="flex-1">
                  Payout mode
                  <select
                    value={payoutMode}
                    onChange={(e) => setPayoutMode(e.target.value as StockOwnerPayoutMode)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  >
                    <option value="FIXED">Fixed</option>
                    <option value="PROFIT_SHARE">Profit share</option>
                  </select>
                </label>
                {payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) && (
                  <label className="flex-1">
                    Share % of their margin
                    <input
                      value={stockOwnerSharePercent}
                      onChange={(e) => setStockOwnerSharePercent(e.target.value)}
                      className="mt-1 w-full rounded border px-2 py-1"
                    />
                  </label>
                )}
              </div>
              <label className="mt-3 block">
                Billing cycle start day (1–28)
                <input
                  value={billingCycleStartDay}
                  onChange={(e) => setBillingCycleStartDay(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
          )}

          {activeType === ("THREE_PL" as Role) && (
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium">3PL settings</p>
              <div className="flex gap-3">
                <label className="flex-1">
                  Type
                  <select
                    value={threePlFulfillmentType}
                    onChange={(e) => setThreePlFulfillmentType(e.target.value as ProductFulfillmentType)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  >
                    <option value="STOCK">Stock</option>
                    <option value="DROPSHIP">Dropshipping</option>
                  </select>
                </label>
                <label className="flex-1">
                  Payout per order fulfilled
                  <input value={payoutPerOrder} onChange={(e) => setPayoutPerOrder(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
              </div>
              <label className="mt-3 block">
                Billing cycle start day (1–28)
                <input
                  value={billingCycleStartDay}
                  onChange={(e) => setBillingCycleStartDay(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
          )}

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 self-start rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-70"
          >
            {submitting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {submitting ? "Sending invite..." : `Send invite as ${activeMeta.label}`}
          </button>
        </form>
      </main>
    </>
  );
}
