"use client";

import type { Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, inviteUser, listUsers, setUserStatus } from "@/lib/api";

const ALL_ROLES: Role[] = ["STAFF", "ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as Role[];
const EARNER_ROLES: Role[] = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as Role[];

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

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  roles: Role[];
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [sharePercent, setSharePercent] = useState("20");
  const [threePlPriceCharged, setThreePlPriceCharged] = useState("");
  const [payoutMode, setPayoutMode] = useState<StockOwnerPayoutMode>("FIXED" as StockOwnerPayoutMode);
  const [stockOwnerSharePercent, setStockOwnerSharePercent] = useState("0");
  const [payoutPerOrder, setPayoutPerOrder] = useState("0");
  const [billingCycleStartDay, setBillingCycleStartDay] = useState("1");
  const [staffPermissions, setStaffPermissions] = useState<StaffPermissionsState>(DEFAULT_STAFF_PERMISSIONS);
  const [hasRevenueShare, setHasRevenueShare] = useState(false);
  const [staffSharePercent, setStaffSharePercent] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
  }, [router]);

  function toggleRole(role: Role) {
    setRoles((prev) => {
      if (prev.includes(role)) return prev.filter((r) => r !== role);
      // Staff and the earner roles are mutually exclusive: selecting one clears the other.
      if (role === ("STAFF" as Role)) return ["STAFF" as Role];
      if (EARNER_ROLES.includes(role)) return [...prev.filter((r) => r !== ("STAFF" as Role)), role];
      return [...prev, role];
    });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await inviteUser({
        name: name || undefined,
        email,
        roles,
        staffPermissions: roles.includes("STAFF" as Role)
          ? {
              ...staffPermissions,
              hasRevenueShare,
              sharePercent: hasRevenueShare ? Number(staffSharePercent) : null,
            }
          : undefined,
        accountHolderProfile: roles.includes("ACCOUNT_HOLDER" as Role)
          ? {
              sharePercent: Number(sharePercent),
              threePlPriceCharged: threePlPriceCharged ? Number(threePlPriceCharged) : null,
              billingCycleStartDay: Number(billingCycleStartDay),
            }
          : undefined,
        stockOwnerProfile: roles.includes("STOCK_OWNER" as Role)
          ? {
              payoutMode,
              sharePercent: payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) ? Number(stockOwnerSharePercent) : null,
              billingCycleStartDay: Number(billingCycleStartDay),
            }
          : undefined,
        threePlProfile: roles.includes("THREE_PL" as Role)
          ? { payoutPerOrder: Number(payoutPerOrder), billingCycleStartDay: Number(billingCycleStartDay) }
          : undefined,
      });
      setShowForm(false);
      setName("");
      setEmail("");
      setRoles([]);
      setStaffPermissions(DEFAULT_STAFF_PERMISSIONS);
      setHasRevenueShare(false);
      setStaffSharePercent("0");
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite user");
    }
  }

  async function toggleStatus(user: UserRow) {
    await setUserStatus(user.id, user.status !== "ACTIVE");
    refresh();
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
          <button onClick={() => setShowForm((v) => !v)} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            {showForm ? "Cancel" : "Invite user"}
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        {showForm && (
          <form onSubmit={handleInvite} className="mt-6 flex flex-col gap-4 rounded border bg-white p-4">
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

            <div className="flex gap-4 text-sm">
              {ALL_ROLES.map((role) => {
                const isStaff = role === ("STAFF" as Role);
                const disabled = isStaff
                  ? roles.some((r) => EARNER_ROLES.includes(r))
                  : roles.includes("STAFF" as Role);
                return (
                  <label key={role} className={`flex items-center gap-2 ${disabled ? "text-gray-400" : ""}`}>
                    <input type="checkbox" checked={roles.includes(role)} disabled={disabled} onChange={() => toggleRole(role)} />
                    {role}
                  </label>
                );
              })}
            </div>
            <p className="-mt-2 text-xs text-gray-500">
              Staff cannot be combined with the earner roles (Account Holder, Stock Owner, 3PL).
            </p>

            {roles.includes("STAFF" as Role) && (
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

            {roles.includes("ACCOUNT_HOLDER" as Role) && (
              <div className="rounded bg-gray-50 p-3 text-sm">
                <p className="mb-2 font-medium">Account Holder settings</p>
                <div className="flex gap-3">
                  <label className="flex-1">
                    Share % of profit
                    <input value={sharePercent} onChange={(e) => setSharePercent(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                  </label>
                  <label className="flex-1">
                    3PL price charged (optional)
                    <input value={threePlPriceCharged} onChange={(e) => setThreePlPriceCharged(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                  </label>
                </div>
              </div>
            )}

            {roles.includes("STOCK_OWNER" as Role) && (
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
                      <option value="FIXED">Fixed (no cut)</option>
                      <option value="PROFIT_SHARE">Profit share</option>
                    </select>
                  </label>
                  {payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) && (
                    <label className="flex-1">
                      Share % of their margin
                      <input value={stockOwnerSharePercent} onChange={(e) => setStockOwnerSharePercent(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                    </label>
                  )}
                </div>
              </div>
            )}

            {roles.includes("THREE_PL" as Role) && (
              <div className="rounded bg-gray-50 p-3 text-sm">
                <p className="mb-2 font-medium">3PL settings</p>
                <label>
                  Payout per order fulfilled
                  <input value={payoutPerOrder} onChange={(e) => setPayoutPerOrder(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
              </div>
            )}

            {(roles.includes("ACCOUNT_HOLDER" as Role) || roles.includes("STOCK_OWNER" as Role) || roles.includes("THREE_PL" as Role)) && (
              <label className="text-sm">
                Billing cycle start day (1–28)
                <input value={billingCycleStartDay} onChange={(e) => setBillingCycleStartDay(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
              </label>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button type="submit" disabled={roles.length === 0} className="self-start rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50">
              Send invite
            </button>
          </form>
        )}

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Roles</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.name ?? "—"}</td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.roles.join(", ")}</td>
                <td className="py-2">{u.status}</td>
                <td className="py-2">
                  <button onClick={() => toggleStatus(u)} className="text-xs text-gray-600 underline">
                    {u.status === "ACTIVE" ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-gray-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
