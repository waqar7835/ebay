"use client";

import { Alert, Button, Card, Checkbox, Form, Input, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag from "@/components/RoleTag";
import { ToggleStatusAction } from "@/components/RowActions";
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
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteForm] = Form.useForm();

  function refresh() {
    listBackofficeUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
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

  async function handleInvite() {
    setFormError(null);
    setSubmitting(true);
    try {
      await inviteBackofficeUser({ name: name || undefined, email, permissions });
      setShowForm(false);
      setName("");
      setEmail("");
      setPermissions(DEFAULT_PERMISSIONS);
      inviteForm.resetFields();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite platform staff");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(user: BackofficeUserRow) {
    await setBackofficeUserStatus(user.id, user.status !== "ACTIVE");
    refresh();
  }

  const columns: TableColumnsType<BackofficeUserRow> = [
    { title: "Name", dataIndex: "name", render: (v) => v ?? "—" },
    { title: "Email", dataIndex: "email" },
    { title: "Role", dataIndex: "role", render: (r: string) => <RoleTag role={r} /> },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string) => <Tag color={s === "ACTIVE" ? "green" : s === "DISABLED" ? "red" : "default"}>{s}</Tag>,
    },
    {
      key: "actions",
      render: (_, u) => (
        <ToggleStatusAction active={u.status === "ACTIVE"} name={u.name ?? u.email} onConfirm={() => toggleStatus(u)} />
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Platform Staff</h1>
          <Button type={showForm ? "default" : "primary"} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Invite platform staff"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Internal ops staff who can act on any company&apos;s data, gated by the permissions below.
        </p>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {showForm && (
          <Card className="mt-6" title="Invite platform staff">
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

              <Card size="small" title="Permissions" className="mb-4">
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSIONS.map(({ key, label }) => (
                    <Checkbox
                      key={key}
                      checked={permissions[key]}
                      onChange={(e) => setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                    >
                      {label}
                    </Checkbox>
                  ))}
                </div>
              </Card>

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting}>
                Send invite
              </Button>
            </Form>
          </Card>
        )}

        <Table<BackofficeUserRow>
          className="mt-6"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={users}
          pagination={false}
          locale={{ emptyText: "No platform staff yet." }}
        />
      </main>
    </>
  );
}
