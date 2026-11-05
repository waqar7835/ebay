"use client";

import type { ProfitSplitSettingsDto } from "@ebay-order-management/shared";
import { Alert, Divider, Form, InputNumber, Modal, Tag } from "antd";
import { useEffect, useState } from "react";
import DateField from "@/components/DateField";
import { updateProfitSplit } from "@/lib/api";

interface FormValues {
  adminPercent: number | null;
  partners: Record<string, number | null>;
  openingBalance: number | null;
  openingCycleStart: string;
}

/**
 * Admin only: the Admin's own % and each partner's % (the company gets the rest), plus the company's opening balance and
 * the first billing cycle that gets profit statements. Partners are marked on the Users page (Staff → Partner).
 */
export default function ProfitSplitModal({
  open,
  settings,
  locked,
  onClose,
  onSaved,
}: {
  open: boolean;
  settings: ProfitSplitSettingsDto | null;
  /** True once a statement exists: the opening balance and first cycle can't change any more. */
  locked: boolean;
  onClose: () => void;
  onSaved: (next: ProfitSplitSettingsDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminPercent = Form.useWatch("adminPercent", form) ?? 0;
  const partnerPercents = Form.useWatch("partners", form) ?? {};

  useEffect(() => {
    if (!open || !settings) return;
    setError(null);
    form.setFieldsValue({
      adminPercent: settings.admin.percent,
      partners: Object.fromEntries(settings.partners.map((p) => [p.userId, p.percent])),
      openingBalance: settings.openingBalance,
      openingCycleStart: settings.openingCycleStart ?? "",
    });
  }, [open, settings, form]);

  const othersTotal =
    Number(adminPercent || 0) + Object.values(partnerPercents).reduce<number>((sum, v) => sum + Number(v || 0), 0);
  const companyPercent = Math.round((100 - othersTotal) * 100) / 100;

  async function handleSave(values: FormValues) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfitSplit({
        adminPercent: values.adminPercent ?? 0,
        partners: settings.partners.map((p) => ({ userId: p.userId, percent: values.partners?.[p.userId] ?? 0 })),
        openingBalance: values.openingBalance ?? null,
        openingCycleStart: values.openingCycleStart || null,
      });
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the profit split");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Profit split settings"
      okText="Save"
      onOk={() => form.submit()}
      okButtonProps={{ disabled: companyPercent < 0 }}
      confirmLoading={saving}
      onCancel={() => !saving && onClose()}
      mask={{ closable: !saving }}
    >
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      <Form<FormValues> form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>
        <p className="mt-0 text-sm text-slate-500">
          Each billing cycle&apos;s profit is split by these percentages. The company gets whatever is left.
        </p>
        <div className="flex flex-col gap-2">
          <PercentRow label={settings?.admin.name ?? "Admin"} tag="Admin" color="purple">
            <Form.Item name="adminPercent" className="mb-0" rules={[{ required: true, message: "Enter a %" }]}>
              <InputNumber min={0} max={100} step={0.01} suffix="%" className="w-32" />
            </Form.Item>
          </PercentRow>
          {settings?.partners.map((p) => (
            <PercentRow key={p.userId} label={p.name} tag="Partner" color="green">
              <Form.Item name={["partners", p.userId]} className="mb-0">
                <InputNumber min={0} max={100} step={0.01} suffix="%" className="w-32" />
              </Form.Item>
            </PercentRow>
          ))}
          <PercentRow label="Company" tag="Company" color="blue">
            <span className={`w-32 pr-3 text-right font-semibold ${companyPercent < 0 ? "text-red-600" : ""}`}>
              {companyPercent}%
            </span>
          </PercentRow>
        </div>
        {companyPercent < 0 && (
          <Alert type="error" showIcon className="mt-3" title="The Admin and partners can't get more than 100% together." />
        )}
        {settings && !settings.partners.length && (
          <Alert
            type="info"
            showIcon
            className="mt-3"
            title="No partners yet"
            description="Mark a Staff account as Partner on its Users → Edit page to give them a share."
          />
        )}

        <Divider className="my-4" />
        <div className="mb-2 text-sm font-medium">Company starting point</div>
        {locked && (
          <Alert
            type="info"
            showIcon
            className="mb-3"
            title="Locked: a profit statement already exists. Delete the statements to change these."
          />
        )}
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item
            name="openingCycleStart"
            label="First cycle"
            tooltip="Any date in the first billing cycle that should get a profit statement"
            rules={[{ required: true, message: "Pick the first cycle" }]}
            className="mb-0"
          >
            <DateField allowClear={false} className="w-full" disabled={locked} />
          </Form.Item>
          <Form.Item
            name="openingBalance"
            label="Opening balance"
            tooltip="The company's net in hand before the first cycle"
            className="mb-0"
          >
            <InputNumber prefix="Rs" step={1} className="w-full" placeholder="0.00" disabled={locked} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function PercentRow({ label, tag, color, children }: { label: string; tag: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{label}</span>
        <Tag color={color} className="m-0">
          {tag}
        </Tag>
      </span>
      {children}
    </div>
  );
}
