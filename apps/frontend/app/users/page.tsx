"use client";

import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZES, type Role } from "@ebay-order-management/shared";
import type { CompanySubscriptionDto } from "@ebay-order-management/shared";
import { Alert, Avatar, Button, Space, Table, Tag, Tooltip, type TableColumnsType } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag, { roleLabel } from "@/components/RoleTag";
import { DeleteAction, EditAction, ToggleStatusAction } from "@/components/RowActions";
import { deleteUser, getSubscription, getToken, listUsersPage, mediaUrl, setUserStatus } from "@/lib/api";

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [subscriptionDisabledCount, setSubscriptionDisabledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<CompanySubscriptionDto | null>(null);

  // Server-side page, plus the plan usage (both change when a user is enabled, disabled or deleted).
  function refresh(p = page, size = pageSize) {
    getSubscription()
      .then(setSubscription)
      .catch(() => undefined);
    setLoading(true);
    listUsersPage(p, size)
      .then((res) => {
        // Deleting the last row of the last page: step back a page.
        if (res.data.length === 0 && res.total > 0 && p > 1) {
          setPage(Math.ceil(res.total / size));
          return;
        }
        setUsers(res.data as UserRow[]);
        setTotal(res.total);
        setSubscriptionDisabledCount(res.subscriptionDisabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    refresh(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, page, pageSize]);

  async function setStatus(user: UserRow, enable: boolean) {
    setError(null);
    try {
      await setUserStatus(user.id, enable);
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
    },
    { title: "Email", dataIndex: "email" },
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
      title: "Actions",
      key: "actions",
      align: "right",
      render: (_, u) => (
        <Space size={2}>
          <EditAction onClick={() => router.push(`/users/${u.id}/edit`)} />
          {!u.roles.includes("ADMIN" as Role) && (
            <>
              {u.status !== "ACTIVE" && (
                <ToggleStatusAction
                  active={false}
                  title="Activate"
                  name={u.name ?? u.email}
                  description={
                    u.status === "INVITED" ? 'They haven\'t accepted the invite yet — they can sign in with the password "changeme".' : undefined
                  }
                  onConfirm={() => setStatus(u, true)}
                />
              )}
              {u.status !== "DISABLED" && (
                <ToggleStatusAction active name={u.name ?? u.email} onConfirm={() => setStatus(u, false)} />
              )}
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
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: LIST_PAGE_SIZES.map(String),
            showTotal: (n, [from, to]) => `${from}–${to} of ${n} users`,
            onChange: (p, size) => {
              setPage(size !== pageSize ? 1 : p);
              setPageSize(size);
            },
          }}
          locale={{ emptyText: "No users yet." }}
        />
      </main>
    </>
  );
}
