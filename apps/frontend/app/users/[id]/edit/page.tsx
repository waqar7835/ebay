"use client";

import type { ProductFulfillmentType, StockOwnerPayoutMode, UserDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  getToken,
  getUser,
  updateAccountHolderProfile,
  updateStaffPermissions,
  updateStockOwnerProfile,
  updateThreePlProfile,
  updateUser,
} from "@/lib/api";

const STAFF_PERMISSIONS = [
  { key: "canManageOrders", label: "Manage orders" },
  { key: "canManageStock", label: "Manage stock" },
  { key: "canManageUsers", label: "Manage users" },
  { key: "canGenerateInvoices", label: "Generate invoices" },
  { key: "canViewFinancials", label: "View financials" },
] as const;

type StaffPermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];
type StaffPermissionsState = Record<StaffPermissionKey, boolean>;

const inputClass = "mt-1 w-full rounded border px-2 py-1";
const disabledInputClass = `${inputClass} bg-gray-50 text-gray-500`;

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<UserDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");

  const [staffPermissions, setStaffPermissions] = useState<StaffPermissionsState>({
    canManageOrders: false,
    canManageStock: false,
    canManageUsers: false,
    canGenerateInvoices: false,
    canViewFinancials: false,
  });
  const [hasRevenueShare, setHasRevenueShare] = useState(false);
  const [staffSharePercent, setStaffSharePercent] = useState("0");

  const [ahSharePercent, setAhSharePercent] = useState("0");
  const [ahThreePlPriceCharged, setAhThreePlPriceCharged] = useState("");
  const [ahBillingCycleStartDay, setAhBillingCycleStartDay] = useState("1");

  const [payoutMode, setPayoutMode] = useState<StockOwnerPayoutMode>("FIXED" as StockOwnerPayoutMode);
  const [soSharePercent, setSoSharePercent] = useState("0");
  const [soBillingCycleStartDay, setSoBillingCycleStartDay] = useState("1");

  const [fulfillmentType, setFulfillmentType] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);
  const [payoutPerOrder, setPayoutPerOrder] = useState("0");
  const [tpBillingCycleStartDay, setTpBillingCycleStartDay] = useState("1");

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    getUser(userId)
      .then((u) => {
        setUser(u);
        setName(u.name ?? "");
        if (u.staffProfile) {
          setStaffPermissions({
            canManageOrders: u.staffProfile.canManageOrders,
            canManageStock: u.staffProfile.canManageStock,
            canManageUsers: u.staffProfile.canManageUsers,
            canGenerateInvoices: u.staffProfile.canGenerateInvoices,
            canViewFinancials: u.staffProfile.canViewFinancials,
          });
          setHasRevenueShare(u.staffProfile.hasRevenueShare);
          setStaffSharePercent(String(u.staffProfile.sharePercent ?? 0));
        }
        if (u.accountHolderProfile) {
          setAhSharePercent(String(u.accountHolderProfile.sharePercent));
          setAhThreePlPriceCharged(
            u.accountHolderProfile.threePlPriceCharged != null ? String(u.accountHolderProfile.threePlPriceCharged) : "",
          );
          setAhBillingCycleStartDay(String(u.accountHolderProfile.billingCycleStartDay));
        }
        if (u.stockOwnerProfile) {
          setPayoutMode(u.stockOwnerProfile.payoutMode);
          setSoSharePercent(String(u.stockOwnerProfile.sharePercent ?? 0));
          setSoBillingCycleStartDay(String(u.stockOwnerProfile.billingCycleStartDay));
        }
        if (u.threePlProfile) {
          setFulfillmentType(u.threePlProfile.fulfillmentType);
          setPayoutPerOrder(String(u.threePlProfile.payoutPerOrder));
          setTpBillingCycleStartDay(String(u.threePlProfile.billingCycleStartDay));
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load user"));
  }, [router, userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (name !== (user.name ?? "")) {
        await updateUser(userId, { name });
      }
      if (user.staffProfile) {
        await updateStaffPermissions(userId, {
          ...staffPermissions,
          hasRevenueShare,
          sharePercent: hasRevenueShare ? Number(staffSharePercent) : null,
        });
      }
      if (user.accountHolderProfile) {
        await updateAccountHolderProfile(userId, {
          sharePercent: Number(ahSharePercent),
          threePlPriceCharged: ahThreePlPriceCharged ? Number(ahThreePlPriceCharged) : null,
          billingCycleStartDay: Number(ahBillingCycleStartDay),
        });
      }
      if (user.stockOwnerProfile) {
        await updateStockOwnerProfile(userId, {
          payoutMode,
          sharePercent: payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) ? Number(soSharePercent) : null,
          billingCycleStartDay: Number(soBillingCycleStartDay),
        });
      }
      if (user.threePlProfile) {
        await updateThreePlProfile(userId, {
          fulfillmentType,
          payoutPerOrder: fulfillmentType === ("STOCK" as ProductFulfillmentType) ? Number(payoutPerOrder) : undefined,
          billingCycleStartDay: Number(tpBillingCycleStartDay),
        });
      }
      router.push("/users");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save user");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-2xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit user</h1>
          <button onClick={() => router.push("/users")} className="rounded border px-3 py-2 text-sm">
            Back to users
          </button>
        </div>

        {loadError && <p className="mt-4 text-red-600">{loadError}</p>}

        {user && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4 rounded border bg-white p-4 text-sm">
            <div className="flex gap-3">
              <label className="flex-1">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </label>
              <label className="flex-1">
                Email
                <input value={user.email} disabled className={disabledInputClass} />
              </label>
            </div>

            <p className="text-gray-600">Roles: {user.roles.join(", ")}</p>

            {user.staffProfile && (
              <div className="rounded bg-gray-50 p-3">
                <p className="mb-2 font-medium">Staff permissions</p>
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

            {user.accountHolderProfile && (
              <div className="rounded bg-gray-50 p-3">
                <p className="mb-2 font-medium">Account Holder settings</p>
                <div className="flex gap-3">
                  <label className="flex-1">
                    Share % of profit
                    <input value={ahSharePercent} onChange={(e) => setAhSharePercent(e.target.value)} className={inputClass} />
                  </label>
                  <label className="flex-1">
                    3PL price charged (optional)
                    <input
                      value={ahThreePlPriceCharged}
                      onChange={(e) => setAhThreePlPriceCharged(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  Billing cycle start day (1–28)
                  <input
                    value={ahBillingCycleStartDay}
                    onChange={(e) => setAhBillingCycleStartDay(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}

            {user.stockOwnerProfile && (
              <div className="rounded bg-gray-50 p-3">
                <p className="mb-2 font-medium">Stock Owner settings</p>
                <div className="flex gap-3">
                  <label className="flex-1">
                    Payout mode
                    <select
                      value={payoutMode}
                      onChange={(e) => setPayoutMode(e.target.value as StockOwnerPayoutMode)}
                      className={inputClass}
                    >
                      <option value="FIXED">Fixed</option>
                      <option value="PROFIT_SHARE">Profit share</option>
                    </select>
                  </label>
                  {payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) && (
                    <label className="flex-1">
                      Share % of their margin
                      <input value={soSharePercent} onChange={(e) => setSoSharePercent(e.target.value)} className={inputClass} />
                    </label>
                  )}
                </div>
                <label className="mt-3 block">
                  Billing cycle start day (1–28)
                  <input
                    value={soBillingCycleStartDay}
                    onChange={(e) => setSoBillingCycleStartDay(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}

            {user.threePlProfile && (
              <div className="rounded bg-gray-50 p-3">
                <p className="mb-2 font-medium">3PL settings</p>
                <div className="flex gap-3">
                  <label className="flex-1">
                    Type
                    <select
                      value={fulfillmentType}
                      onChange={(e) => setFulfillmentType(e.target.value as ProductFulfillmentType)}
                      className={inputClass}
                    >
                      <option value="STOCK">Stock</option>
                      <option value="DROPSHIP">Dropshipping</option>
                    </select>
                  </label>
                  {fulfillmentType === ("STOCK" as ProductFulfillmentType) && (
                    <label className="flex-1">
                      Payout per order fulfilled
                      <input value={payoutPerOrder} onChange={(e) => setPayoutPerOrder(e.target.value)} className={inputClass} />
                    </label>
                  )}
                </div>
                {fulfillmentType === ("DROPSHIP" as ProductFulfillmentType) && (
                  <p className="mt-2 text-xs text-gray-500">
                    Dropshipping 3PLs have no fixed rate — they're paid the buy price they enter against each order.
                  </p>
                )}
                <label className="mt-3 block">
                  Billing cycle start day (1–28)
                  <input
                    value={tpBillingCycleStartDay}
                    onChange={(e) => setTpBillingCycleStartDay(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}

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
