"use client";

import type { Role } from "@ebay-order-management/shared";
import type { CompanySubscriptionDto } from "@ebay-order-management/shared";
import { Alert, Avatar, Button, Space, Table, Tag, Tooltip, type TableColumnsType } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag, { roleLabel } from "@/components/RoleTag";
import { DeleteAction, EditAction, ToggleStatusAction } from "@/components/RowActions";
import { deleteUser, getSubscription, getToken, listUsers, mediaUrl, setUserStatus } from "@/lib/api";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
  disabledBySubscription: boolean;
  roles: Role[];
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<CompanySubscriptionDto | null>(null);

  function refresh() {
    getSubscription()
      .then(setSubscription)
      .catch(() => undefined);
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    refresh();
  }, [router]);

  async function toggleStatus(user: UserRow) {
    setError(null);
    try {
      await setUserStatus(user.id, user.status === "DISABLED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
    refresh();
  }

  async function remove(user: UserRow) {
    setError(null);
    try {
      await deleteUser(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
    refresh();
  }

  const subscriptionDisabledCount = users.filter((u) => u.disabledBySubscription && u.status === "DISABLED").length;

  const columns: TableColumnsType<UserRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (v: string | null, u) => (
        <span className="flex items-center gap-2">
          <Avatar size={28} src={u.avatarUrl ? mediaUrl(u.avatarUrl) : undefined}>
            {(v || u.email).charAt(0).toUpperCase()}
          </Avatar>
          {v ?? "—"}
        </span>
      ),
      sorter: (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
    },
    { title: "Email", dataIndex: "email", sorter: (a, b) => a.email.localeCompare(b.email) },
    { title: "Roles", dataIndex: "roles", render: (roles: Role[]) => roles.map((r) => <RoleTag key={r} role={r} />) },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string, u) => (
        <>
          <Tag color={s === "ACTIVE" ? "green" : s === "DISABLED" ? "red" : "default"}>{s}</Tag>
          {s === "DISABLED" && u.disabledBySubscription && (
            <Tooltip title="Deactivated when the subscription expired. Re-enable it, or renew to restore everyone.">
              <Tag color="orange">Subscription expired</Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      key: "actions",
      render: (_, u) => (
        <Space size={2}>
          <EditAction onClick={() => router.push(`/users/${u.id}/edit`)} />
          {!u.roles.includes("ADMIN" as Role) && (
            <>
              <ToggleStatusAction active={u.status !== "DISABLED"} name={u.name ?? u.email} onConfirm={() => toggleStatus(u)} />
              <DeleteAction confirmTitle={`Delete ${u.name ?? u.email}? This can't be undone.`} onConfirm={() => remove(u)} />
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
          <Button type="primary" onClick={() => router.push("/users/invite")}>
            Invite user
          </Button>
        </div>

        {subscription && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>
              <Link href="/subscription">{subscription.plan.name} plan</Link>:
            </span>
            {subscription.usage.map((u) => (
              <Tag key={u.role} color={u.used >= u.limit ? "red" : "default"}>
                {roleLabel(u.role)} {u.used}/{u.limit}
              </Tag>
            ))}
          </div>
        )}
        {subscriptionDisabledCount > 0 && (
          <Alert
            type="warning"
            className="mt-4"
            showIcon
            title={`${subscriptionDisabledCount} account${subscriptionDisabledCount === 1 ? " was" : "s were"} deactivated when your subscription expired`}
            description={
              <>
                You can re-enable accounts up to your current plan&apos;s limits, or <Link href="/subscription">renew your subscription</Link> to
                restore them all automatically.
              </>
            }
          />
        )}
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
