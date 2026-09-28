"use client";

import { Alert, Button, Card, Form, Input, InputNumber, Select, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import FileUpload from "@/components/FileUpload";
import { getToken, listSeatOrders, listUsers, previewSeatCharge, submitSeatOrder } from "@/lib/api";
import RoleTag from "@/components/RoleTag";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const PAID_ROLES = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"];

interface SeatPreview {
  userId: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
}

const ORDER_STATUS_COLOR: Record<string, string> = { SUBMITTED: "blue", APPROVED: "green", REJECTED: "red" };

export default function BillingPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [months, setMonths] = useState(1);
  const [previews, setPreviews] = useState<SeatPreview[] | null>(null);
  const [referenceNote, setReferenceNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    listSeatOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    listUsers().then(setUsers as never).catch(() => undefined);
  }, [router]);

  const paidRoleUsers = users.filter((u) => u.roles.some((r) => PAID_ROLES.includes(r)));
  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u?.name || u?.email || id;
  };

  async function handlePreview() {
    if (userIds.length === 0) return;
    try {
      const results = await Promise.all(
        userIds.map(async (id) => ({ userId: id, ...(await previewSeatCharge(id, Number(months))) })),
      );
      setPreviews(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview charge");
    }
  }

  async function handleSubmit() {
    setMessage(null);
    setError(null);
    setSubmitting(true);
    try {
      await submitSeatOrder(
        userIds.map((id) => ({ userId: id, months: Number(months) })),
        referenceNote,
        receipt,
      );
      setMessage("Seat payment order submitted for Super Admin review.");
      setPreviews(null);
      setUserIds([]);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit payment order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Seat Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Account Holder, Stock Owner, and 3PL seats require payment. Submit a payment order with your receipt for
          the Super Admin to review.
        </p>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}
        {message && <Alert type="success" title={message} className="mt-4" showIcon />}

        <Card className="mt-6">
          <Form layout="vertical" onFinish={handleSubmit}>
            <div className="flex items-end gap-3">
              <Form.Item label="Seats" required className="flex-1">
                {/* Selected tags show just the name (the option label); the dropdown also shows each user's paid roles. */}
                <Select
                  mode="multiple"
                  allowClear
                  showSearch={{ optionFilterProp: "label" }}
                  placeholder="Select users…"
                  value={userIds}
                  onChange={(v) => {
                    setUserIds(v);
                    setPreviews(null);
                  }}
                  options={paidRoleUsers.map((u) => ({
                    value: u.id,
                    label: u.name || u.email,
                    roles: u.roles.filter((r) => PAID_ROLES.includes(r)),
                  }))}
                  optionRender={(o) => (
                    <div className="flex items-center justify-between gap-2">
                      <span>{o.label}</span>
                      <span>
                        {(o.data.roles as string[]).map((r) => (
                          <RoleTag key={r} role={r} />
                        ))}
                      </span>
                    </div>
                  )}
                />
              </Form.Item>
              <Form.Item label="Months" className="w-32">
                <InputNumber
                  min={1}
                  precision={0}
                  value={months}
                  onChange={(v) => {
                    setMonths(v ?? 1);
                    setPreviews(null);
                  }}
                  className="w-full"
                />
              </Form.Item>
              <Form.Item>
                <Button onClick={handlePreview} disabled={userIds.length === 0}>
                  Preview
                </Button>
              </Form.Item>
            </div>

            {previews && (
              <Alert
                type="info"
                className="mb-4"
                title={`Total: $${previews.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`}
                description={
                  <ul className="m-0 list-none p-0">
                    {previews.map((p) => (
                      <li key={p.userId}>
                        {userName(p.userId)}: {new Date(p.periodStart).toLocaleDateString()} –{" "}
                        {new Date(p.periodEnd).toLocaleDateString()}, ${p.amount.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                }
              />
            )}

            <Form.Item label="Reference note (optional)">
              <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} />
            </Form.Item>
            <Form.Item label="Receipt">
              <FileUpload value={receipt} onChange={setReceipt} label="Select receipt" />
            </Form.Item>

            <Button type="primary" htmlType="submit" disabled={userIds.length === 0} loading={submitting}>
              Submit payment order
            </Button>
          </Form>
        </Card>

        <Table
          className="mt-6"
          rowKey="id"
          size="small"
          dataSource={orders}
          pagination={false}
          locale={{ emptyText: "No seat payment orders yet." }}
          columns={[
            { title: "Submitted", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString() },
            { title: "Total", dataIndex: "totalAmount", render: (v: number) => `$${Number(v).toFixed(2)}` },
            { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={ORDER_STATUS_COLOR[s]}>{s}</Tag> },
          ]}
        />
      </main>
    </>
  );
}
