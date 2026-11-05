"use client";

import { ExpenseChargedTo, type ExpenseCategoryDto, type ExpenseDto, type ProfitSplitMemberDto } from "@ebay-order-management/shared";
import { Alert, Form, Input, InputNumber, Modal, Select } from "antd";
import { useEffect, useState } from "react";
import DateField from "@/components/DateField";
import { createExpense, localDateOnly, updateExpense } from "@/lib/api";
import { searchable } from "@/lib/selectOptions";

interface FormValues {
  title: string;
  amount: number | null;
  expenseDate: string;
  categoryId: string | null;
  chargedTo: string;
  notes: string;
}

/** "COMPANY", or the id of the Admin / partner it's charged to. */
const COMPANY = "COMPANY";

/**
 * Add / edit an expense (PKR). The Admin can charge it to the company, themselves or any partner; a partner only to
 * themselves or the company (`members` is already narrowed to what the requester may pick).
 */
export default function ExpenseModal({
  open,
  expense,
  members,
  categories,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null = a new expense. */
  expense: ExpenseDto | null;
  members: ProfitSplitMemberDto[];
  categories: ExpenseCategoryDto[];
  /** Preselected date for a new expense (inside the cycle being viewed). */
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.setFieldsValue(
      expense
        ? {
            title: expense.title,
            amount: expense.amount,
            expenseDate: expense.expenseDate,
            categoryId: expense.categoryId,
            chargedTo: expense.chargedTo === ExpenseChargedTo.COMPANY ? COMPANY : (expense.chargedToUserId ?? COMPANY),
            notes: expense.notes ?? "",
          }
        : { title: "", amount: null, expenseDate: defaultDate ?? localDateOnly(), categoryId: null, chargedTo: COMPANY, notes: "" },
    );
  }, [open, expense, defaultDate, form]);

  async function handleSave(values: FormValues) {
    setSaving(true);
    setError(null);
    const input = {
      title: values.title.trim(),
      amount: values.amount ?? 0,
      expenseDate: values.expenseDate,
      categoryId: values.categoryId ?? null,
      notes: values.notes?.trim() || null,
      chargedTo: values.chargedTo === COMPANY ? ExpenseChargedTo.COMPANY : ExpenseChargedTo.USER,
      chargedToUserId: values.chargedTo === COMPANY ? null : values.chargedTo,
    };
    try {
      if (expense) await updateExpense(expense.id, input);
      else await createExpense(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the expense");
    } finally {
      setSaving(false);
    }
  }

  const chargedToOptions = [
    { value: COMPANY, label: "Company" },
    ...members.map((m) => ({ value: m.userId, label: `${m.name} (${m.kind === "ADMIN" ? "Admin" : "Partner"})` })),
  ];

  return (
    <Modal
      open={open}
      title={expense ? "Edit expense" : "Add expense"}
      okText={expense ? "Save" : "Add expense"}
      onOk={() => form.submit()}
      confirmLoading={saving}
      onCancel={() => !saving && onClose()}
      mask={{ closable: !saving }}
    >
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      <Form<FormValues> form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>
        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: "Enter a title" }]}>
          <Input maxLength={120} placeholder="e.g. Office rent" />
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true, message: "Enter the amount" }, { type: "number", min: 0.01, message: "Must be more than 0" }]}
          >
            <InputNumber prefix="Rs" min={0} step={1} className="w-full" placeholder="0.00" />
          </Form.Item>
          <Form.Item
            name="expenseDate"
            label="Date"
            tooltip="Picks the billing cycle it's deducted in"
            rules={[{ required: true, message: "Pick a date" }]}
          >
            <DateField allowClear={false} className="w-full" />
          </Form.Item>
          <Form.Item name="chargedTo" label="Charged to" tooltip="Whose profit it comes out of" rules={[{ required: true }]}>
            <Select options={chargedToOptions} showSearch={searchable} />
          </Form.Item>
          <Form.Item name="categoryId" label="Category">
            <Select
              allowClear
              placeholder={categories.length ? "Choose a category" : "No categories yet"}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              showSearch={searchable}
            />
          </Form.Item>
        </div>
        <Form.Item name="notes" label="Notes" className="mb-0">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
