"use client";

import type {
  InvoiceableOrderDto,
  InvoiceDraftInput,
  InvoiceMiscLineInput,
  InvoiceRole,
  InvoiceTemplatesDto,
  UserDto,
} from "@ebay-order-management/shared";
import { DeleteOutlined, PlusCircleOutlined } from "@ant-design/icons";
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
import InvoiceTemplateSwatches, { LAYOUT_LABELS } from "@/components/InvoiceTemplateSwatches";
import {
  createInvoice,
  getInvoice,
  getStoredUser,
  getToken,
  listInvoiceableOrders,
  listInvoiceTemplates,
  listUsers,
  previewInvoice,
  updateInvoice,
} from "@/lib/api";
import { searchable, userOptions } from "@/lib/selectOptions";
import { CURRENCY_SYMBOL, invoiceMoney } from "@/lib/currency";
import { formatDate } from "@/lib/date";

const INVOICE_ROLES = ["ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"] as InvoiceRole[];

/** Row key: an order can be offered both as a new line and (once refunded) as a refund adjustment. */
const rowKey = (row: Pick<InvoiceableOrderDto, "kind" | "orderId">) => `${row.kind}:${row.orderId}`;

type MiscLineValue = Partial<InvoiceMiscLineInput>;
const isBlank = (l: MiscLineValue | undefined) => !l?.title?.trim() && l?.amount == null;

/**
 * Create / edit invoice wizard: pick the user + role and their open orders → add misc lines → review
 * the DRAFT PDF → approve. With `invoiceId` it edits that UNPAID invoice: user and role are fixed, its
 * orders and misc lines start selected, and approving re-issues it under the same number.
 */
export default function InvoiceWizard({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const user = getStoredUser();
  const canManage = (user?.roles.includes("ADMIN" as never) ?? false) || !!user?.staffPermissions?.canGenerateInvoices;
  const editing = !!invoiceId;

  const [step, setStep] = useState(0);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [userId, setUserId] = useState<string>();
  const [role, setRole] = useState<InvoiceRole>();
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceableOrderDto[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [miscForm] = Form.useForm<{ lines: MiscLineValue[] }>();
  const miscValues = Form.useWatch("lines", miscForm);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [templates, setTemplates] = useState<InvoiceTemplatesDto | null>(null);
  /** The template picked on the Review step; until then the invoice's own (when editing) or the default. */
  const [pickedTemplateId, setPickedTemplateId] = useState<string>();
  const [invoiceTemplateId, setInvoiceTemplateId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (!canManage) {
      router.push("/invoices");
      return;
    }
    listUsers()
      .then((all) => setUsers(all.filter((u) => u.roles.some((r) => INVOICE_ROLES.includes(r as InvoiceRole)))))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
    listInvoiceTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoice templates"));
    if (invoiceId) {
      getInvoice(invoiceId)
        .then((invoice) => {
          if (invoice.status !== "UNPAID") {
            setError("Only unpaid invoices can be edited — void a paid invoice and issue a new one.");
            return;
          }
          const invoiceRole = invoice.role as InvoiceRole;
          setInvoiceNumber(invoice.invoiceNumber);
          setUserId(invoice.userId);
          setRole(invoiceRole);
          setInvoiceTemplateId(invoice.template?.templateId);
          const keep = invoice.lineItems
            .filter((l) => l.orderId && (l.kind === "ORDER" || l.kind === "REFUND"))
            .map((l) => rowKey({ kind: l.kind as InvoiceableOrderDto["kind"], orderId: l.orderId! }));
          loadRows(invoice.userId, invoiceRole, keep);
          const misc = invoice.lineItems
            .filter((l) => l.kind === "MISC")
            .map((l) => ({ title: l.description, amount: Number(l.netAmount) }));
          miscForm.setFieldsValue({ lines: misc.length ? misc : [{}] });
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the invoice"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, invoiceId]);

  // Free the previewed PDF when it's replaced or the page closes.
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const selectedUser = users.find((u) => u.id === userId);
  const roleChoices = (selectedUser?.roles.filter((r) => INVOICE_ROLES.includes(r as InvoiceRole)) ??
    []) as InvoiceRole[];
  const isAccountHolder = role === "ACCOUNT_HOLDER";
  // Account Holder invoices are in their own currency; Stock Owner / 3PL invoices in PKR.
  const currency = rows[0]?.currency ?? (isAccountHolder && selectedUser ? selectedUser.currency : "PKR");
  const fmt = (v: number) => invoiceMoney(v, currency);

  // An edited invoice starts on its own template while that still exists, otherwise on the default.
  const templateId =
    pickedTemplateId ??
    (invoiceTemplateId && templates?.templates.some((t) => t.id === invoiceTemplateId)
      ? invoiceTemplateId
      : templates?.defaultTemplateId);

  function loadRows(nextUserId: string | undefined, nextRole: InvoiceRole | undefined, preselect: string[] = []) {
    setRows([]);
    setSelected([]);
    if (!nextUserId || !nextRole) return;
    setRowsLoading(true);
    setError(null);
    listInvoiceableOrders(nextUserId, nextRole, invoiceId)
      .then((loaded) => {
        setRows(loaded);
        const available = new Set(loaded.map(rowKey));
        setSelected(preselect.filter((key) => available.has(key)));
      })
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
      templateId,
    };
  }

  async function renderPreview(draftInput: InvoiceDraftInput) {
    const blob = await previewInvoice(draftInput, invoiceId);
    setPdfUrl(URL.createObjectURL(blob));
  }

  async function changeTemplate(id: string) {
    setPickedTemplateId(id);
    setBusy(true);
    setError(null);
    try {
      await renderPreview({ ...draft(), templateId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to render the invoice");
    } finally {
      setBusy(false);
    }
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
      await renderPreview(draft());
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
      if (invoiceId) await updateInvoice(invoiceId, draft());
      else await createInvoice(draft());
      router.push("/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${editing ? "save" : "create"} the invoice`);
      setBusy(false);
    }
  }

  const columns: TableColumnsType<InvoiceableOrderDto> = [
    { title: "Order #", dataIndex: "ebayOrderRef", render: (v: string) => <span className="font-medium">{v}</span> },
    { title: "Date", dataIndex: "orderDate", render: (v: string) => formatDate(v) },
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
              title="Saved before currencies. Edit and save the order (it converts with today's rates) to invoice it."
            >
              <Tag color="warning">Re-save first</Tag>
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

  // A misc line is optional: a fully blank row is ignored, but a half-filled one needs both parts.
  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <BackLink
          href="/invoices"
          label="Invoices"
          title={editing ? `Edit invoice${invoiceNumber ? ` ${invoiceNumber}` : ""}` : "Create invoice"}
        />

        <Steps
          className="invoice-steps mt-6"
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
                  disabled={editing}
                  options={userOptions(users)}
                  className="mt-1 flex w-full"
                />
              </label>
              <label>
                Invoice as
                <Select
                  placeholder="Role"
                  value={role}
                  disabled={!userId || editing}
                  onChange={(r) => {
                    setRole(r);
                    loadRows(userId, r);
                  }}
                  options={roleChoices.map((r) => ({ value: r, label: roleLabel(r) }))}
                  className="mt-1 flex w-full"
                />
              </label>
            </div>
            {editing && (
              <p className="mb-0 mt-2 text-xs text-slate-500">
                The user and role of an existing invoice can&apos;t be changed — delete it and create a new one instead.
              </p>
            )}

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
          <p className="mb-5 mt-0 text-sm text-slate-600">
            Add any other charges or credits.{" "}
            {isAccountHolder
              ? "Positive amounts are added to what the Account Holder owes; negative amounts reduce it."
              : "Positive amounts are added to the payout; negative amounts are deducted from it."}
          </p>
          <Form form={miscForm} layout="vertical" requiredMark={false} initialValues={{ lines: [{}] }}>
            <Form.List name="lines">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }, index) => (
                    <div key={key} className="flex items-start gap-3">
                      <Form.Item
                        name={[name, "title"]}
                        className="w-full max-w-md"
                        dependencies={[["lines", name, "amount"]]}
                        rules={[
                          ({ getFieldValue }) => ({
                            validator: (_, value) =>
                              isBlank(getFieldValue(["lines", name])) || value?.trim()
                                ? Promise.resolve()
                                : Promise.reject(new Error("Enter a title")),
                          }),
                        ]}
                      >
                        <Input placeholder="Title, e.g. Packaging supplies" maxLength={200} />
                      </Form.Item>
                      <Form.Item
                        name={[name, "amount"]}
                        dependencies={[["lines", name, "title"]]}
                        rules={[
                          ({ getFieldValue }) => ({
                            validator: (_, value) =>
                              isBlank(getFieldValue(["lines", name])) || value != null
                                ? Promise.resolve()
                                : Promise.reject(new Error("Enter an amount")),
                          }),
                        ]}
                      >
                        <InputNumber placeholder="0.00" step={0.01} precision={2} prefix={symbol} className="w-44" />
                      </Form.Item>
                      <Tooltip title="Add a line below">
                        <Button
                          type="text"
                          icon={<PlusCircleOutlined />}
                          onClick={() => add({}, index + 1)}
                          aria-label="Add a line below"
                        />
                      </Tooltip>
                      <Tooltip title="Remove this line">
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            remove(name);
                            // Keep one (blank) row to type into.
                            if (fields.length === 1) add({});
                          }}
                          aria-label="Remove this line"
                        />
                      </Tooltip>
                    </div>
                  ))}
                </>
              )}
            </Form.List>
          </Form>
          <div className="space-y-1 text-xs text-slate-500">
            <div>
              <PlusCircleOutlined className="mr-1.5" />
              Adds another charge or credit line below that row.
            </div>
            <div>
              <DeleteOutlined className="mr-1.5" />
              Removes that line. Blank lines are ignored, so you can leave this step empty if there&apos;s nothing to add.
            </div>
          </div>

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
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span>Template</span>
              <Select
                className="min-w-72"
                showSearch={searchable}
                value={templateId}
                onChange={changeTemplate}
                disabled={busy || !templates}
                options={(templates?.templates ?? []).map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.id === templates?.defaultTemplateId ? " (default)" : ""}`,
                  template: t,
                }))}
                optionRender={(option) => (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div>{option.data.label}</div>
                      <div className="text-xs text-slate-500">{LAYOUT_LABELS[option.data.template.layout].name} layout</div>
                    </div>
                    <InvoiceTemplateSwatches colors={option.data.template.colors} />
                  </div>
                )}
              />
              <span className="text-xs text-slate-500">The PDF keeps this style once approved.</span>
            </div>
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
                {editing ? "Save invoice" : "Approve invoice"}
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
