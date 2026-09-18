"use client";

import type { Role } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, listUsers, setUserStatus } from "@/lib/api";

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
          <button onClick={() => router.push("/users/invite")} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            Invite user
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

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
                  <div className="flex items-center gap-3">
                    <button onClick={() => router.push(`/users/${u.id}/edit`)} className="text-xs text-gray-600 underline">
                      Edit
                    </button>
                    {!u.roles.includes("ADMIN" as Role) && (
                      <button onClick={() => toggleStatus(u)} className="text-xs text-gray-600 underline">
                        {u.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    )}
                  </div>
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
