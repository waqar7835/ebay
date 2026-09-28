"use client";

import type { InvoiceDto, Role } from "@ebay-order-management/shared";
import { Alert, Button, Card, Popconfirm, Select, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag, { roleLabel } from "@/components/RoleTag";
import { DeleteAction } from "@/components/RowActions";
import InvoiceCyclePicker from "@/components/InvoiceCyclePicker";
import {
  deleteInvoice,
  generateInvoice,
  generateMyInvoice,
  getStoredUser,
  getToken,
  listInvoices,
  listMyInvoices,
  listUsers,
  markInvoicePaid,
} from "@/lib/api";
import { searchable, userLabel, userOptions } from "@/lib/selectOptions";

const EARNER_ROLES: Role[] = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as Role[];

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: Role[];
}

export default function InvoicesPage() {
  const router = useRouter();
  const user = getStoredUser();

  // --- self-service: my own invoices ---
  const [myInvoices, setMyInvoices] = useState<InvoiceDto[]>([]);
  const [role, setRole] = useState<Role>((user?.roles.find((r) => EARNER_ROLES.includes(r)) ?? "ACCOUNT_HOLDER") as Role);
  const [myError, setMyError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const myRoles = user?.roles.filter((r) => EARNER_ROLES.includes(r)) ?? [];
  const [myPeriodStart, setMyPeriodStart] = useState<string | undefined>();
  const [cycleReload, setCycleReload] = useState(0);

  // --- admin view: company-wide invoices ---
  const isAdmin = user?.roles.includes("ADMIN" as Role) ?? false;
  const canManageInvoices = isAdmin || !!user?.staffPermissions?.canGenerateInvoices || !!user?.staffPermissions?.canViewFinancials;
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [genUserId, setGenUserId] = useState("");
  const [genRole, setGenRole] = useState<Role>("ACCOUNT_HOLDER" as Role);
  const [genPeriodStart, setGenPeriodStart] = useState<string | undefined>();
  const [adminError, setAdminError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function refreshMine() {
    if (!user) return;
    listMyInvoices(user.id)
      .then(setMyInvoices)
      .catch((err) => setMyError(err instanceof Error ? err.message : "Failed to load"));
  }

  function refreshAdmin() {
    if (!canManageInvoices) return;
    listInvoices()
      .then(setInvoices)
      .catch((err) => setAdminError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refreshMine();
    refreshAdmin();
    if (canManageInvoices) {
      listUsers().then(setUsers as never).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const selectedUser = users.find((u) => u.id === genUserId);
  const availableRoles = selectedUser?.roles.filter((r) => r !== ("ADMIN" as Role)) ?? [];

  async function handleGenerateMine() {
    if (!user) return;
    setMyError(null);
    setMessage(null);
    try {
      await generateMyInvoice(user.id, role, myPeriodStart);
      setMessage("Invoice generated.");
      refreshMine();
      refreshAdmin();
      setCycleReload((n) => n + 1);
    } catch (err) {
      setMyError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleGenerateForUser() {
    setFormError(null);
    try {
      await generateInvoice(genUserId, genRole, genPeriodStart);
      refreshAdmin();
      refreshMine();
      setCycleReload((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleDelete(id: string) {
    setAdminError(null);
    try {
      await deleteInvoice(id);
      refreshAdmin();
      refreshMine();
      setCycleReload((n) => n + 1);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to delete invoice");
    }
  }

  async function handleMarkPaid(id: string) {
    await markInvoicePaid(id);
    refreshAdmin();
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  const statusTag = (status: string) => <Tag color={status === "PAID" ? "green" : "orange"}>{status}</Tag>;

  const myColumns: TableColumnsType<InvoiceDto> = [
    { title: "Role", dataIndex: "role", render: (r: string) => <RoleTag role={r} /> },
    { title: "Period", key: "period", render: (_, inv) => `${inv.periodStart} – ${inv.periodEnd}` },
    { title: "Total", dataIndex: "totalAmount", render: (v: number) => `$${v.toFixed(2)}` },
    { title: "Status", dataIndex: "status", render: statusTag },
  ];

  const companyColumns: TableColumnsType<InvoiceDto> = [
    { title: "User", dataIndex: "userId", render: (id: string) => (userById.has(id) ? userLabel(userById.get(id)) : id) },
    ...myColumns,
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
        <h1 className="text-2xl font-semibold">My Invoices</h1>

        {myRoles.length > 0 && (
          <Card size="small" className="mt-6">
            <div className="flex items-end gap-3 text-sm">
              {myRoles.length > 1 && (
                <label>
                  Role
                  <Select
                    value={role}
                    onChange={(v) => setRole(v)}
                    options={myRoles.map((r) => ({ value: r, label: roleLabel(r) }))}
                    className="mt-1 flex w-44"
                  />
                </label>
              )}
            </div>
            <div className="mt-3 flex items-end gap-3 text-sm">
              <div className="flex-1">
                <InvoiceCyclePicker
                  userId={user?.id ?? ""}
                  role={role}
                  value={myPeriodStart}
                  onChange={setMyPeriodStart}
                  reloadKey={cycleReload}
                />
              </div>
              <Button type="primary" disabled={!myPeriodStart} onClick={handleGenerateMine}>
                Generate invoice
              </Button>
            </div>
          </Card>
        )}

        {myError && <Alert type="error" title={myError} className="mt-4" showIcon />}
        {message && <Alert type="success" title={message} className="mt-4" showIcon />}

        <Table<InvoiceDto>
          className="mt-6"
          rowKey="id"
          size="small"
          columns={myColumns}
          dataSource={myInvoices}
          pagination={false}
          locale={{ emptyText: "No invoices yet." }}
        />

        {canManageInvoices && (
          <>
            <h2 className="mt-12 text-xl font-semibold">Company Invoices</h2>
            {adminError && <Alert type="error" title={adminError} className="mt-4" showIcon />}

            <Card size="small" className="mt-6">
              <div className="flex items-end gap-3 text-sm">
                <label className="flex-1">
                  User
                  <Select
                    showSearch={searchable}
                    placeholder="Select…"
                    value={genUserId || undefined}
                    onChange={(v) => {
                      setGenUserId(v);
                      const roles = users.find((u) => u.id === v)?.roles.filter((r) => r !== ("ADMIN" as Role)) ?? [];
                      if (!roles.includes(genRole) && roles[0]) setGenRole(roles[0]);
                    }}
                    options={userOptions(users)}
                    className="mt-1 flex w-full"
                  />
                </label>
                <label className="flex-1">
                  Role
                  <Select
                    value={availableRoles.includes(genRole) ? genRole : undefined}
                    onChange={(v) => setGenRole(v)}
                    options={availableRoles.map((r) => ({ value: r, label: roleLabel(r) }))}
                    className="mt-1 flex w-full"
                  />
                </label>
              </div>
              <div className="mt-3 flex items-end gap-3 text-sm">
                <div className="flex-1">
                  <InvoiceCyclePicker
                    userId={availableRoles.includes(genRole) ? genUserId : ""}
                    role={genRole}
                    value={genPeriodStart}
                    onChange={setGenPeriodStart}
                    reloadKey={cycleReload}
                  />
                </div>
                <Button type="primary" disabled={!genUserId || !genPeriodStart} onClick={handleGenerateForUser}>
                  Generate invoice
                </Button>
              </div>
            </Card>
            {formError && <Alert type="error" title={formError} className="mt-2" showIcon />}

            <Table<InvoiceDto>
              className="mt-6"
              rowKey="id"
              size="small"
              columns={companyColumns}
              dataSource={invoices}
              pagination={{ pageSize: 50, hideOnSinglePage: true }}
              locale={{ emptyText: "No invoices yet." }}
            />
          </>
        )}
      </main>
    </>
  );
}
