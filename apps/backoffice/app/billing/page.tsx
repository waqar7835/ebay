"use client";

import { Alert, Button, Card, Form, Input, InputNumber, Select, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import FileUpload from "@/components/FileUpload";
import { getToken, listSeatOrders, listUsers, previewSeatCharge, submitSeatOrder } from "@/lib/api";
import { searchable, userLabel } from "@/lib/selectOptions";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const ORDER_STATUS_COLOR: Record<string, string> = { SUBMITTED: "blue", APPROVED: "green", REJECTED: "red" };

export default function BillingPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [months, setMonths] = useState(1);
  const [preview, setPreview] = useState<{ amount: number; periodStart: string; periodEnd: string } | null>(null);
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

  const paidRoleUsers = users.filter((u) => u.roles.some((r) => ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"].includes(r)));

  async function handlePreview() {
    if (!userId) return;
    try {
      const result = await previewSeatCharge(userId, Number(months));
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview charge");
    }
  }

  async function handleSubmit() {
    setMessage(null);
    setError(null);
    setSubmitting(true);
    try {
      await submitSeatOrder([{ userId, months: Number(months) }], referenceNote, receipt);
      setMessage("Seat payment order submitted for Super Admin review.");
      setPreview(null);
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
      <main className="ml-56 max-w-4xl p-8">
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
              <Form.Item label="Seat" required className="flex-1">
                <Select
                  showSearch={searchable}
                  placeholder="Select…"
                  value={userId || undefined}
                  onChange={(v) => setUserId(v)}
                  options={paidRoleUsers.map((u) => ({ value: u.id, label: `${userLabel(u)} — ${u.roles.join(", ")}` }))}
                />
              </Form.Item>
              <Form.Item label="Months" className="w-32">
                <InputNumber min={1} precision={0} value={months} onChange={(v) => setMonths(v ?? 1)} className="w-full" />
              </Form.Item>
              <Form.Item>
                <Button onClick={handlePreview} disabled={!userId}>
                  Preview
                </Button>
              </Form.Item>
            </div>

            {preview && (
              <Alert
                type="info"
                className="mb-4"
                title={`Period ${new Date(preview.periodStart).toLocaleDateString()} – ${new Date(preview.periodEnd).toLocaleDateString()}: $${preview.amount.toFixed(2)}`}
              />
            )}

            <Form.Item label="Reference note (optional)">
              <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} />
            </Form.Item>
            <Form.Item label="Receipt">
              <FileUpload value={receipt} onChange={setReceipt} label="Select receipt" />
            </Form.Item>

            <Button type="primary" htmlType="submit" disabled={!userId} loading={submitting}>
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
