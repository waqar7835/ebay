"use client";

import { useCallback, useEffect, useState } from "react";
import { LockOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Statistic, Table, Tooltip } from "antd";
import type { AccountHolderAdvanceDto, AccountHolderAdvancesDto, Currency } from "@ebay-order-management/shared";
import { addAdvance, deleteAdvance, getAdvances, getMyAdvances, updateAdvance } from "@/lib/api";
import { currencySymbol, money } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import DateField from "@/components/DateField";
import { DeleteAction, EditAction } from "@/components/RowActions";

interface Props {
  /** Manage this Account Holder's advance (company Admin / partners). Omitted = the logged-in holder's own, read-only. */
  userId?: string;
}

interface Draft {
  amount: number | null;
  depositDate: string;
  note: string;
}

// Local date (not UTC), so an advance added late in the evening isn't dated tomorrow.
const today = () => dayjs().format("YYYY-MM-DD");
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * Account Holder advances (2026-11-25): money the holder paid up front. Each Account Holder invoice is paid from it
 * first (oldest deposit first); a deposit any invoice used is locked.
 */
export default function AdvancesCard({ userId }: Props) {
  const manage = !!userId;
  const [data, setData] = useState<AccountHolderAdvancesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountHolderAdvanceDto | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ amount: null, depositDate: today(), note: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    (userId ? getAdvances(userId) : getMyAdvances())
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errorText(e, "Couldn't load the advance")));
  }, [userId]);

  useEffect(load, [load]);

  const cur = (data?.currency ?? null) as Currency | null;
  const fmt = (v: number) => money(v, cur);

  function openEditor(advance: AccountHolderAdvanceDto | "new") {
    setEditing(advance);
    setSaveError(null);
    setDraft(
      advance === "new"
        ? { amount: null, depositDate: today(), note: "" }
        : { amount: advance.amount, depositDate: advance.depositDate, note: advance.note ?? "" },
    );
  }

  async function save() {
    if (!userId || !editing) return;
    if (!draft.amount || draft.amount <= 0) return setSaveError("Enter an amount more than 0");
    if (!draft.depositDate) return setSaveError("Pick the date the advance was received");
    setSaving(true);
    setSaveError(null);
    const payload = { amount: draft.amount, depositDate: draft.depositDate, note: draft.note.trim() || null };
    try {
      setData(editing === "new" ? await addAdvance(userId, payload) : await updateAdvance(userId, editing.id, payload));
      setEditing(null);
    } catch (e) {
      setSaveError(errorText(e, "Failed to save the advance"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(advance: AccountHolderAdvanceDto) {
    if (!userId) return;
    try {
      setData(await deleteAdvance(userId, advance.id));
    } catch (e) {
      setError(errorText(e, "Failed to delete the advance"));
    }
  }

  return (
    <Card
      title={manage ? "Advance" : "Your advance"}
      extra={
        manage && (
          <Button icon={<PlusOutlined />} onClick={() => openEditor("new")} disabled={!data}>
            Add advance
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        {manage
          ? "Money this client paid up front. Each new invoice for them is paid from it first (oldest advance first), and the invoice shows only what's left to pay. An advance that was used on an invoice can't be changed — add a new one instead."
          : "Money you paid up front. Each invoice is paid from it first, and the invoice shows only what's left to pay."}
      </p>
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      {data && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Statistic title="Balance" value={fmt(data.balance)} styles={{ content: { color: data.balance > 0 ? "#15803d" : undefined } }} />
            <Statistic title="Total received" value={fmt(data.totalDeposited)} />
            <Statistic title="Used on invoices" value={fmt(data.totalUsed)} />
          </div>
          <Table
            rowKey="id"
            size="small"
            dataSource={data.deposits}
            pagination={data.deposits.length > 10 ? { pageSize: 10 } : false}
            locale={{ emptyText: "No advances yet" }}
            scroll={{ x: true }}
            columns={[
              { title: "Date", key: "date", render: (_, a) => formatDate(a.depositDate) },
              { title: "Amount", key: "amount", align: "right", render: (_, a) => fmt(a.amount) },
              { title: "Used", key: "used", align: "right", render: (_, a) => fmt(a.used) },
              { title: "Left", key: "left", align: "right", render: (_, a) => fmt(Math.round((a.amount - a.used) * 100) / 100) },
              { title: "Note", dataIndex: "note", render: (note: string | null) => note || "—" },
              ...(manage
                ? [
                    {
                      title: "",
                      key: "actions",
                      align: "right" as const,
                      render: (_: unknown, a: AccountHolderAdvanceDto) =>
                        a.locked ? (
                          <Tooltip title="Used on an invoice — it can't be changed. Add a new advance instead.">
                            <LockOutlined className="px-2 text-slate-400" />
                          </Tooltip>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <EditAction onClick={() => openEditor(a)} />
                            <DeleteAction confirmTitle="Delete this advance?" onConfirm={() => remove(a)} />
                          </div>
                        ),
                    },
                  ]
                : []),
            ]}
          />
          {data.usages.length > 0 && (
            <>
              <div className="mb-2 mt-5 text-sm font-medium text-slate-700">Used on invoices</div>
              <Table
                rowKey="invoiceId"
                size="small"
                dataSource={data.usages}
                pagination={data.usages.length > 10 ? { pageSize: 10 } : false}
                columns={[
                  { title: "Invoice #", dataIndex: "invoiceNumber" },
                  { title: "Date", key: "date", render: (_, u) => formatDate(u.invoiceDate) },
                  { title: "Paid from advance", key: "amount", align: "right", render: (_, u) => fmt(u.amount) },
                ]}
              />
            </>
          )}
        </>
      )}

      {manage && (
        <Modal
          open={!!editing}
          title={editing === "new" ? "Add advance" : "Edit advance"}
          onCancel={() => !saving && setEditing(null)}
          onOk={save}
          okText="Save"
          confirmLoading={saving}
          
        >
          {saveError && <Alert type="error" title={saveError} className="mb-4" showIcon />}
          <Form layout="vertical" component="div">
            <Form.Item label={`Amount (${data?.currency ?? ""})`} required>
              <InputNumber
                className="w-full"
                prefix={currencySymbol(cur)}
                min={0.01}
                step={0.01}
                precision={2}
                value={draft.amount}
                onChange={(v) => setDraft((d) => ({ ...d, amount: v }))}
                autoFocus
              />
            </Form.Item>
            <Form.Item label="Date received" required>
              <DateField value={draft.depositDate} onChange={(v) => setDraft((d) => ({ ...d, depositDate: v }))} allowClear={false} className="w-full" />
            </Form.Item>
            <Form.Item label="Note" className="mb-0">
              <Input.TextArea
                rows={2}
                maxLength={2000}
                placeholder="e.g. Bank transfer reference"
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </Card>
  );
}
