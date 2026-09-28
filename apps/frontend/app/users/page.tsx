"use client";

import type { Role } from "@ebay-order-management/shared";
import { Alert, Button, Space, Table, Tag, type TableColumnsType } from "antd";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
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

  const columns: TableColumnsType<UserRow> = [
    { title: "Name", dataIndex: "name", render: (v) => v ?? "—", sorter: (a, b) => (a.name ?? "").localeCompare(b.name ?? "") },
    { title: "Email", dataIndex: "email", sorter: (a, b) => a.email.localeCompare(b.email) },
    { title: "Roles", dataIndex: "roles", render: (roles: Role[]) => roles.map((r) => <Tag key={r}>{r}</Tag>) },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string) => <Tag color={s === "ACTIVE" ? "green" : s === "DISABLED" ? "red" : "default"}>{s}</Tag>,
    },
    {
      key: "actions",
      render: (_, u) => (
        <Space size="small">
          <Button size="small" onClick={() => router.push(`/users/${u.id}/edit`)}>
            Edit
          </Button>
          {!u.roles.includes("ADMIN" as Role) && (
            <Button size="small" danger={u.status === "ACTIVE"} onClick={() => toggleStatus(u)}>
              {u.status === "ACTIVE" ? "Disable" : "Enable"}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
          <Button type="primary" onClick={() => router.push("/users/invite")}>
            Invite user
          </Button>
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <Table<UserRow>
          className="mt-6"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={users}
          pagination={false}
          locale={{ emptyText: "No users yet." }}
        />
      </main>
    </>
  );
}
