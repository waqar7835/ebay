"use client";

import type {
  InvoiceableOrderDto,
  InvoiceDraftInput,
  InvoiceMiscLineInput,
  InvoiceRole,
  UserDto,
} from "@ebay-order-management/shared";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Steps,
  Table,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import { roleLabel } from "@/components/RoleTag";
import { createInvoice, getStoredUser, getToken, listInvoiceableOrders, listUsers, previewInvoice } from "@/lib/api";
import { searchable, userOptions } from "@/lib/selectOptions";
import { CURRENCY_SYMBOL, invoiceMoney } from "@/lib/currency";

const INVOICE_ROLES = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as InvoiceRole[];

/** Row key: an order can be offered both as a new line and (once refunded) as a refund adjustment. */
const rowKey = (row: InvoiceableOrderDto) => `${row.kind}:${row.orderId}`;

export default function NewInvoicePage() {
  const router = useRouter();
  const user = getStoredUser();
  const canManage = (user?.roles.includes("ADMIN" as never) ?? false) || !!user?.staffPermissions?.canGenerateInvoices;

  const [step, setStep] = useState(0);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [userId, setUserId] = useState<string>();
  const [role, setRole] = useState<InvoiceRole>();
  const [rows, setRows] = useState<InvoiceableOrderDto[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [miscForm] = Form.useForm<{ lines: Partial<InvoiceMiscLineInput>[] }>();
  const miscValues = Form.useWatch("lines", miscForm);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    if (!canManage) {
      router.push("/invoices");
      return;
    }
    listUsers()
      .then((all) => setUsers(all.filter((u) => u.roles.some((r) => INVOICE_ROLES.includes(r as InvoiceRole)))))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Free the previewed PDF when it's replaced or the page closes.
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const selectedUser = users.find((u) => u.id === userId);
  const roleChoices = (selectedUser?.roles.filter((r) => INVOICE_ROLES.includes(r as InvoiceRole)) ??
    []) as InvoiceRole[];
  const isAccountHolder = role === "ACCOUNT_HOLDER";
  // Account Holder invoices are in their own currency; Stock Owner / 3PL invoices in PKR.
  const currency = rows[0]?.currency ?? (isAccountHolder && selectedUser ? selectedUser.currency : "PKR");
  const fmt = (v: number) => invoiceMoney(v, currency);

  function loadRows(nextUserId: string | undefined, nextRole: InvoiceRole | undefined) {
    setRows([]);
    setSelected([]);
    if (!nextUserId || !nextRole) return;
    setRowsLoading(true);
    setError(null);
    listInvoiceableOrders(nextUserId, nextRole)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orders"))
      .finally(() => setRowsLoading(false));
  }

  function chooseUser(id: string) {
    setUserId(id);
    const roles = (users.find((u) => u.id === id)?.roles.filter((r) => INVOICE_ROLES.includes(r as InvoiceRole)) ??
      []) as InvoiceRole[];
    const nextRole = role && roles.includes(role) ? role : roles[0];
    setRole(nextRole);
    loadRows(id, nextRole);
  }

  const selectedRows = rows.filter((r) => selected.includes(rowKey(r)));
  const ordersTotal = round2(selectedRows.reduce((sum, r) => sum + r.netAmount, 0));
  const miscLines = useMemo(
    () =>
      (miscValues ?? [])
        .filter((l) => l?.title?.trim() && l.amount != null)
        .map((l) => ({ title: l.title!.trim(), amount: Number(l.amount) })),
    [miscValues],
  );
  const miscTotal = round2(miscLines.reduce((sum, l) => sum + l.amount, 0));

  function draft(): InvoiceDraftInput {
    return {
      userId: userId!,
      role: role!,
      orderIds: selectedRows.filter((r) => r.kind === "ORDER").map((r) => r.orderId),
      refundOrderIds: selectedRows.filter((r) => r.kind === "REFUND").map((r) => r.orderId),
      miscLines,
    };
  }

  async function goToReview() {
    try {
      await miscForm.validateFields();
    } catch {
      return;
    }
    if (!selectedRows.length && !miscLines.length) {
      setError("Select at least one order or add a line.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await previewInvoice(draft());
      setPdfUrl(URL.createObjectURL(blob));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to render the invoice");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await createInvoice(draft());
      router.push("/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the invoice");
      setBusy(false);
    }
  }

  const columns: TableColumnsType<InvoiceableOrderDto> = [
    { title: "Order #", dataIndex: "ebayOrderRef", render: (v: string) => <span className="font-medium">{v}</span> },
    { title: "Date", dataIndex: "orderDate" },
    {
      title: "Status",
      key: "status",
      render: (_, r) => (
        <>
          {r.kind === "REFUND" ? (
            <Tag color="red">Refund adjustment</Tag>
          ) : (
            <Tag color={r.status === "DELIVERED" ? "green" : "blue"}>{r.status}</Tag>
          )}
          {r.needsRecalculation && (
            <Tooltip
              title={`Saved before currencies. Edit the order and save with "Recalculate with today's rates" to invoice it.`}
            >
              <Tag color="warning">Recalculate first</Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    { title: "Details", dataIndex: "description", render: (v: string) => <span className="text-slate-500">{v}</span> },
    {
      title: isAccountHolder ? "Owed to company" : "Payable",
      dataIndex: "netAmount",
      align: "right",
      render: (v: number) => <span className={v < 0 ? "text-red-600" : undefined}>{fmt(v)}</span>,
    },
  ];

  const symbol = currency === "PKR" ? "Rs" : (CURRENCY_SYMBOL[currency as keyof typeof CURRENCY_SYMBOL] ?? currency);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <BackLink href="/invoices" label="Invoices" title="Create invoice" />

        <Steps
          className="mt-6"
          current={step}
          items={[{ title: "Select orders" }, { title: "Miscellaneous" }, { title: "Review & approve" }]}
        />

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {step === 0 && (
          <Card className="mt-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <label>
                User
                <Select
                  showSearch={searchable}
                  placeholder="Select a user…"
                  value={userId}
                  onChange={chooseUser}
                  options={userOptions(users)}
                  className="mt-1 flex w-full"
                />
              </label>
              <label>
                Invoice as
                <Select
                  placeholder="Role"
                  value={role}
                  disabled={!userId}
                  onChange={(r) => {
                    setRole(r);
                    loadRows(userId, r);
                  }}
                  options={roleChoices.map((r) => ({ value: r, label: roleLabel(r) }))}
                  className="mt-1 flex w-full"
                />
              </label>
            </div>

            {isAccountHolder && (
              <Alert
                className="mt-4"
                type="info"
                showIcon
                title={`Account Holders keep the eBay proceeds, so this invoice is what they owe the company (profit share + buying price + 3PL charges + any shipping label bought outside eBay), in ${currency}.`}
              />
            )}

            <Table<InvoiceableOrderDto>
              className="mt-4"
              rowKey={rowKey}
              size="small"
              loading={rowsLoading}
              columns={columns}
              dataSource={rows}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys as string[]),
                getCheckboxProps: (r) => ({ disabled: r.needsRecalculation }),
              }}
              locale={{
                emptyText:
                  userId && role
                    ? "No open shipped/delivered orders for this user."
                    : "Select a user to see their open orders.",
              }}
            />

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-slate-600">
                {selectedRows.length} selected · <span className="font-semibold">{fmt(ordersTotal)}</span>
              </span>
              <Button type="primary" disabled={!userId || !role} onClick={() => setStep(1)}>
                Process
              </Button>
            </div>
          </Card>
        )}

        {/* Kept mounted (hidden) so the lines survive going back to step 1. */}
        <Card className={step === 1 ? "mt-6" : "hidden"}>
          <p className="mt-0 text-sm text-slate-600">
            Add any other charges or credits.{" "}
            {isAccountHolder
              ? "Positive amounts are added to what the Account Holder owes; negative amounts reduce it."
              : "Positive amounts are added to the payout; negative amounts are deducted from it."}
          </p>
          <Form form={miscForm} layout="vertical" requiredMark={false} initialValues={{ lines: [] }}>
            <Form.List name="lines">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <div key={key} className="flex items-start gap-3">
                      <Form.Item
                        name={[name, "title"]}
                        className="flex-1"
                        rules={[{ required: true, whitespace: true, message: "Enter a title" }]}
                      >
                        <Input placeholder="Title, e.g. Packaging supplies" maxLength={200} />
                      </Form.Item>
                      <Form.Item name={[name, "amount"]} rules={[{ required: true, message: "Enter an amount" }]}>
                        <InputNumber placeholder="0.00" step={0.01} precision={2} prefix={symbol} className="w-44" />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        aria-label="Remove line"
                      />
                    </div>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>
                    Add line
                  </Button>
                </>
              )}
            </Form.List>
          </Form>

          <div className="mt-6 flex flex-col items-end gap-1 text-sm">
            <div>
              Orders ({selectedRows.length}): <span className="font-medium">{fmt(ordersTotal)}</span>
            </div>
            <div>
              Miscellaneous: <span className="font-medium">{fmt(miscTotal)}</span>
            </div>
            <div className="text-base">
              {isAccountHolder ? "Total owed to company" : "Total payable"}:{" "}
              <span className="font-semibold">{fmt(round2(ordersTotal + miscTotal))}</span>
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button type="primary" loading={busy} onClick={goToReview}>
              Review
            </Button>
          </div>
        </Card>

        {step === 2 && (
          <Card className="mt-6">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                title="Invoice preview"
                className="h-[80vh] w-full rounded border border-slate-200"
              />
            ) : (
              <Spin />
            )}
            <div className="mt-4 flex justify-between">
              <Button onClick={() => setStep(1)} disabled={busy}>
                Back
              </Button>
              <Button type="primary" loading={busy} onClick={approve}>
                Approve invoice
              </Button>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
