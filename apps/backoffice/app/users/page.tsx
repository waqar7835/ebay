"use client";

import type { ProductFulfillmentType, Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getSelectedCompanyId, getStoredUser, getToken, inviteUser, listUsers, setUserStatus } from "@/lib/api";

const ALL_ROLES: Role[] = ["STAFF", "ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as Role[];
const PORTAL_ROLES: Role[] = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as Role[];

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
  const [threePlFulfillmentType, setThreePlFulfillmentType] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);
  const [billingCycleStartDay, setBillingCycleStartDay] = useState("1");
  const [staffPermissions, setStaffPermissions] = useState<StaffPermissionsState>(DEFAULT_STAFF_PERMISSIONS);
  const [hasRevenueShare, setHasRevenueShare] = useState(false);
  const [staffSharePercent, setStaffSharePercent] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteForm] = Form.useForm();

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

  const user = getStoredUser();
  const isBackofficeRealm = user?.roles.includes("SUPER_ADMIN" as Role) || user?.roles.includes("PLATFORM_STAFF" as Role);
  const needsCompanySelection = isBackofficeRealm && !getSelectedCompanyId();

  function toggleRole(role: Role) {
    setRoles((prev) => {
      if (prev.includes(role)) return prev.filter((r) => r !== role);
      // Staff (backoffice) and the partner-portal roles are separate systems: selecting one clears the other.
      if (role === ("STAFF" as Role)) return ["STAFF" as Role];
      if (PORTAL_ROLES.includes(role)) return [...prev.filter((r) => r !== ("STAFF" as Role)), role];
      return [...prev, role];
    });
  }

  async function handleInvite() {
    setFormError(null);
    setSubmitting(true);
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
          ? {
              payoutPerOrder: threePlFulfillmentType === ("STOCK" as ProductFulfillmentType) ? Number(payoutPerOrder) : undefined,
              billingCycleStartDay: Number(billingCycleStartDay),
              fulfillmentType: threePlFulfillmentType,
            }
          : undefined,
      });
      setShowForm(false);
      setName("");
      setEmail("");
      setRoles([]);
      setStaffPermissions(DEFAULT_STAFF_PERMISSIONS);
      setHasRevenueShare(false);
      setStaffSharePercent("0");
      inviteForm.resetFields();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(user: UserRow) {
    await setUserStatus(user.id, user.status !== "ACTIVE");
    refresh();
  }

  const numProps = (value: string, set: (v: string) => void) => ({
    value: value === "" ? null : value,
    onChange: (v: string | number | null) => set(v == null ? "" : String(v)),
  });

  const columns: TableColumnsType<UserRow> = [
    { title: "Name", dataIndex: "name", render: (v) => v ?? "—", sorter: (a, b) => (a.name ?? "").localeCompare(b.name ?? "") },
    { title: "Email", dataIndex: "email", sorter: (a, b) => a.email.localeCompare(b.email) },
    { title: "Roles", dataIndex: "roles", render: (rs: Role[]) => rs.map((r) => <Tag key={r}>{r}</Tag>) },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string) => <Tag color={s === "ACTIVE" ? "green" : s === "DISABLED" ? "red" : "default"}>{s}</Tag>,
    },
    {
      key: "actions",
      render: (_, u) => (
        <Button size="small" danger={u.status === "ACTIVE"} onClick={() => toggleStatus(u)}>
          {u.status === "ACTIVE" ? "Disable" : "Enable"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
          <Button type={showForm ? "default" : "primary"} onClick={() => setShowForm((v) => !v)} disabled={needsCompanySelection}>
            {showForm ? "Cancel" : "Invite user"}
          </Button>
        </div>

        {needsCompanySelection && (
          <Alert type="warning" title="Select a company from the sidebar first to manage its users." className="mt-4" showIcon />
        )}

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {showForm && !needsCompanySelection && (
          <Card className="mt-6" title="Invite user">
            <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
              <div className="flex gap-3">
                <Form.Item label="Name" className="flex-1">
                  <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                </Form.Item>
                <Form.Item
                  label="Email"
                  name="email"
                  rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
                  className="flex-1"
                >
                  <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Form.Item>
              </div>

              <Form.Item
                label="Roles"
                extra="Staff is a backoffice-only role and cannot be combined with partner portal roles (Account Holder, Stock Owner, 3PL)."
              >
                <div className="flex gap-4">
                  {ALL_ROLES.map((role) => {
                    const isStaff = role === ("STAFF" as Role);
                    const disabled = isStaff ? roles.some((r) => PORTAL_ROLES.includes(r)) : roles.includes("STAFF" as Role);
                    return (
                      <Checkbox key={role} checked={roles.includes(role)} disabled={disabled} onChange={() => toggleRole(role)}>
                        {role}
                      </Checkbox>
                    );
                  })}
                </div>
              </Form.Item>

              {roles.includes("STAFF" as Role) && (
                <Card size="small" title="Backoffice permissions" className="mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    {STAFF_PERMISSIONS.map(({ key, label }) => (
                      <Checkbox
                        key={key}
                        checked={staffPermissions[key]}
                        onChange={(e) => setStaffPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                      >
                        {label}
                      </Checkbox>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Checkbox checked={hasRevenueShare} onChange={(e) => setHasRevenueShare(e.target.checked)}>
                      Revenue share
                    </Checkbox>
                    {hasRevenueShare && (
                      <InputNumber suffix="%" min={0} max={100} className="w-28" {...numProps(staffSharePercent, setStaffSharePercent)} />
                    )}
                  </div>
                </Card>
              )}

              {roles.includes("ACCOUNT_HOLDER" as Role) && (
                <Card size="small" title="Account Holder settings" className="mb-4">
                  <div className="flex gap-3">
                    <Form.Item label="Share % of profit" className="mb-0 flex-1">
                      <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(sharePercent, setSharePercent)} />
                    </Form.Item>
                    <Form.Item label="3PL price charged (optional)" className="mb-0 flex-1">
                      <InputNumber prefix="$" min={0} step={0.01} className="w-full" {...numProps(threePlPriceCharged, setThreePlPriceCharged)} />
                    </Form.Item>
                  </div>
                </Card>
              )}

              {roles.includes("STOCK_OWNER" as Role) && (
                <Card size="small" title="Stock Owner settings" className="mb-4">
                  <div className="flex gap-3">
                    <Form.Item label="Payout mode" className="mb-0 flex-1">
                      <Select
                        value={payoutMode}
                        onChange={(v) => setPayoutMode(v)}
                        options={[
                          { value: "FIXED", label: "Fixed (no cut)" },
                          { value: "PROFIT_SHARE", label: "Profit share" },
                        ]}
                      />
                    </Form.Item>
                    {payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) && (
                      <Form.Item label="Share % of their margin" className="mb-0 flex-1">
                        <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(stockOwnerSharePercent, setStockOwnerSharePercent)} />
                      </Form.Item>
                    )}
                  </div>
                </Card>
              )}

              {roles.includes("THREE_PL" as Role) && (
                <Card size="small" title="3PL settings" className="mb-4">
                  <Form.Item label="Type">
                    <Select
                      value={threePlFulfillmentType}
                      onChange={(v) => setThreePlFulfillmentType(v)}
                      options={[
                        { value: "STOCK", label: "Stock" },
                        { value: "DROPSHIP", label: "Dropshipping" },
                      ]}
                    />
                  </Form.Item>
                  {threePlFulfillmentType === ("STOCK" as ProductFulfillmentType) ? (
                    <Form.Item label="Payout per order fulfilled" className="mb-0">
                      <InputNumber prefix="$" min={0} step={0.01} className="w-full" {...numProps(payoutPerOrder, setPayoutPerOrder)} />
                    </Form.Item>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Dropshipping 3PLs have no fixed rate — they&apos;re paid the buy price they enter against each order.
                    </p>
                  )}
                </Card>
              )}

              {(roles.includes("ACCOUNT_HOLDER" as Role) || roles.includes("STOCK_OWNER" as Role) || roles.includes("THREE_PL" as Role)) && (
                <Form.Item label="Billing cycle start day (1–28)">
                  <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(billingCycleStartDay, setBillingCycleStartDay)} />
                </Form.Item>
              )}

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" disabled={roles.length === 0} loading={submitting}>
                Send invite
              </Button>
            </Form>
          </Card>
        )}

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
