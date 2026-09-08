"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getStoredUser, getToken, inviteBackofficeUser, listBackofficeUsers, setBackofficeUserStatus } from "@/lib/api";

const PERMISSIONS = [
  { key: "canManageOrders", label: "Manage orders" },
  { key: "canManageStock", label: "Manage stock" },
  { key: "canManageUsers", label: "Manage users" },
  { key: "canGenerateInvoices", label: "Generate invoices" },
  { key: "canViewFinancials", label: "View financials" },
] as const;

type PermissionKey = (typeof PERMISSIONS)[number]["key"];
type PermissionsState = Record<PermissionKey, boolean>;

const DEFAULT_PERMISSIONS: PermissionsState = {
  canManageOrders: false,
  canManageStock: false,
  canManageUsers: false,
  canGenerateInvoices: false,
  canViewFinancials: false,
};

interface BackofficeUserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  role: string;
}

export default function PlatformStaffPage() {
  const router = useRouter();
  const [users, setUsers] = useState<BackofficeUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<PermissionsState>(DEFAULT_PERMISSIONS);
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    listBackofficeUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    if (!token || !user?.roles.includes("SUPER_ADMIN" as never)) {
      router.push("/dashboard");
      return;
    }
    refresh();
  }, [router]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await inviteBackofficeUser({ name: name || undefined, email, permissions });
      setShowForm(false);
      setName("");
      setEmail("");
      setPermissions(DEFAULT_PERMISSIONS);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite platform staff");
    }
  }

  async function toggleStatus(user: BackofficeUserRow) {
    await setBackofficeUserStatus(user.id, user.status !== "ACTIVE");
    refresh();
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Platform Staff</h1>
          <button onClick={() => setShowForm((v) => !v)} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            {showForm ? "Cancel" : "Invite platform staff"}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Internal ops staff who can act on any company&apos;s data, gated by the permissions below.
        </p>

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

            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium">Permissions</p>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={permissions[key]}
                      onChange={(e) => setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button type="submit" className="self-start rounded bg-gray-900 px-3 py-2 text-sm text-white">
              Send invite
            </button>
          </form>
        )}

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.name ?? "—"}</td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.role}</td>
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
                  No platform staff yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
