"use client";

import type { InvoiceDto, Role } from "@ebay-order-management/shared";
import { Alert, Button, Card, Popconfirm, Select, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag, { roleLabel } from "@/components/RoleTag";
import { DeleteAction } from "@/components/RowActions";
import InvoiceCyclePicker from "@/components/InvoiceCyclePicker";
import { deleteInvoice, generateInvoice, getToken, listInvoices, listUsers, markInvoicePaid } from "@/lib/api";
import { searchable, userLabel, userOptions } from "@/lib/selectOptions";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: Role[];
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("ACCOUNT_HOLDER" as Role);
  const [periodStart, setPeriodStart] = useState<string | undefined>();
  const [cycleReload, setCycleReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    listUsers().then(setUsers as never).catch(() => undefined);
  }, [router]);

  const rolesFor = (id: string): Role[] => users.find((u) => u.id === id)?.roles.filter((r) => r !== ("ADMIN" as Role)) ?? [];
  const availableRoles = rolesFor(userId);
  const userById = new Map(users.map((u) => [u.id, u]));

  async function handleGenerate() {
    setFormError(null);
    try {
      await generateInvoice(userId, role, periodStart);
      refresh();
      setCycleReload((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteInvoice(id);
      refresh();
      setCycleReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    }
  }

  async function handleMarkPaid(id: string) {
    await markInvoicePaid(id);
    refresh();
  }

  const columns: TableColumnsType<InvoiceDto> = [
    { title: "User", dataIndex: "userId", render: (id: string) => (userById.has(id) ? userLabel(userById.get(id)) : id) },
    { title: "Role", dataIndex: "role", render: (r: string) => <RoleTag role={r} /> },
    { title: "Period", key: "period", render: (_, inv) => `${inv.periodStart} – ${inv.periodEnd}` },
    { title: "Total", dataIndex: "totalAmount", render: (v: number) => `$${v.toFixed(2)}` },
    { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={s === "PAID" ? "green" : "orange"}>{s}</Tag> },
    {
      key: "actions",
      render: (_, inv) => (
        <div className="flex items-center gap-1">
          {inv.status === "UNPAID" && (
            <Popconfirm title="Mark this invoice as paid?" onConfirm={() => handleMarkPaid(inv.id)}>
              <Button size="small">Mark paid</Button>
            </Popconfirm>
          )}
          {inv.deletable && (
            <DeleteAction confirmTitle="Delete this invoice? You can re-generate it for the same cycle." onConfirm={() => handleDelete(inv.id)} />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <Card size="small" className="mt-6">
          <div className="flex items-end gap-3 text-sm">
            <label className="flex-1">
              User
              <Select
                showSearch={searchable}
                placeholder="Select…"
                value={userId || undefined}
                onChange={(v) => {
                  setUserId(v);
                  const roles = rolesFor(v);
                  if (!roles.includes(role) && roles[0]) setRole(roles[0]);
                }}
                options={userOptions(users)}
                className="mt-1 flex w-full"
              />
            </label>
            <label className="flex-1">
              Role
              <Select
                value={availableRoles.includes(role) ? role : undefined}
                onChange={(v) => setRole(v)}
                options={availableRoles.map((r) => ({ value: r, label: roleLabel(r) }))}
                className="mt-1 flex w-full"
              />
            </label>
          </div>
          <div className="mt-3 flex items-end gap-3 text-sm">
            <div className="flex-1">
              <InvoiceCyclePicker
                userId={availableRoles.includes(role) ? userId : ""}
                role={role}
                value={periodStart}
                onChange={setPeriodStart}
                reloadKey={cycleReload}
              />
            </div>
            <Button type="primary" disabled={!userId || !periodStart} onClick={handleGenerate}>
              Generate invoice
            </Button>
          </div>
        </Card>
        {formError && <Alert type="error" title={formError} className="mt-2" showIcon />}

        <Table<InvoiceDto>
          className="mt-6"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={invoices}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: "No invoices yet." }}
        />
      </main>
    </>
  );
}
