"use client";

import type { ProductFulfillmentType, Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Tabs } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getToken, inviteUser } from "@/lib/api";

const USER_TYPES: { role: Role; label: string; description: string }[] = [
  { role: "STAFF" as Role, label: "Staff", description: "An employee who manages orders, stock, users or invoices on your behalf." },
  { role: "ACCOUNT_HOLDER" as Role, label: "Account Holder", description: "Earns a share of profit and is billed on a recurring cycle." },
  { role: "STOCK_OWNER" as Role, label: "Stock Owner", description: "Supplies stock and is paid a fixed amount or a share of margin." },
  { role: "THREE_PL" as Role, label: "3PL", description: "A fulfillment partner paid per order fulfilled." },
];

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

export default function InviteUserPage() {
  const router = useRouter();
  const [activeType, setActiveType] = useState<Role>("STAFF" as Role);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
    }
  }, [router]);

  function switchType(role: Role) {
    setActiveType(role);
    setFormError(null);
    setSuccessMessage(null);
  }

  async function handleInvite() {
    setFormError(null);
    setSuccessMessage(null);
    setSubmitting(true);
    try {
      await inviteUser({
        name: name || undefined,
        email,
        roles: [activeType],
        staffPermissions:
          activeType === ("STAFF" as Role)
            ? {
                ...staffPermissions,
                hasRevenueShare,
                sharePercent: hasRevenueShare ? Number(staffSharePercent) : null,
              }
            : undefined,
        accountHolderProfile:
          activeType === ("ACCOUNT_HOLDER" as Role)
            ? {
                sharePercent: Number(sharePercent),
                threePlPriceCharged: threePlPriceCharged ? Number(threePlPriceCharged) : null,
                billingCycleStartDay: Number(billingCycleStartDay),
              }
            : undefined,
        stockOwnerProfile:
          activeType === ("STOCK_OWNER" as Role)
            ? {
                payoutMode,
                sharePercent: payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) ? Number(stockOwnerSharePercent) : null,
                billingCycleStartDay: Number(billingCycleStartDay),
              }
            : undefined,
        threePlProfile:
          activeType === ("THREE_PL" as Role)
            ? {
                payoutPerOrder: threePlFulfillmentType === ("STOCK" as ProductFulfillmentType) ? Number(payoutPerOrder) : undefined,
                billingCycleStartDay: Number(billingCycleStartDay),
                fulfillmentType: threePlFulfillmentType,
              }
            : undefined,
      });
      const label = USER_TYPES.find((t) => t.role === activeType)?.label ?? activeType;
      setSuccessMessage(`Invited ${email} as ${label}. Switch tabs above to invite the same person for another user type.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  const activeMeta = USER_TYPES.find((t) => t.role === activeType)!;

  const numProps = (value: string, set: (v: string) => void) => ({
    value: value === "" ? null : value,
    onChange: (v: string | number | null) => set(v == null ? "" : String(v)),
  });

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Invite user</h1>
          <Button onClick={() => router.push("/users")}>Back to users</Button>
        </div>

        <Tabs
          className="mt-6"
          activeKey={activeType}
          onChange={(key) => !submitting && switchType(key as Role)}
          items={USER_TYPES.map(({ role, label }) => ({ key: role, label, disabled: submitting }))}
        />
        <p className="text-xs text-gray-500">{activeMeta.description}</p>

        <Card className="mt-4">
          <Form layout="vertical" onFinish={handleInvite}>
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

            {activeType === ("STAFF" as Role) && (
              <Card size="small" title="Permissions" className="mb-4">
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

            {activeType === ("ACCOUNT_HOLDER" as Role) && (
              <Card size="small" title="Account Holder settings" className="mb-4">
                <div className="flex gap-3">
                  <Form.Item label="Share % of profit" className="flex-1">
                    <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(sharePercent, setSharePercent)} />
                  </Form.Item>
                  <Form.Item label="3PL price charged (optional)" className="flex-1">
                    <InputNumber prefix="$" min={0} step={0.01} className="w-full" {...numProps(threePlPriceCharged, setThreePlPriceCharged)} />
                  </Form.Item>
                </div>
                <Form.Item label="Billing cycle start day (1–28)" className="mb-0">
                  <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(billingCycleStartDay, setBillingCycleStartDay)} />
                </Form.Item>
              </Card>
            )}

            {activeType === ("STOCK_OWNER" as Role) && (
              <Card size="small" title="Stock Owner settings" className="mb-4">
                <div className="flex gap-3">
                  <Form.Item label="Payout mode" className="flex-1">
                    <Select
                      value={payoutMode}
                      onChange={(v) => setPayoutMode(v)}
                      options={[
                        { value: "FIXED", label: "Fixed" },
                        { value: "PROFIT_SHARE", label: "Profit share" },
                      ]}
                    />
                  </Form.Item>
                  {payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) && (
                    <Form.Item label="Share % of their margin" className="flex-1">
                      <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(stockOwnerSharePercent, setStockOwnerSharePercent)} />
                    </Form.Item>
                  )}
                </div>
                <Form.Item label="Billing cycle start day (1–28)" className="mb-0">
                  <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(billingCycleStartDay, setBillingCycleStartDay)} />
                </Form.Item>
              </Card>
            )}

            {activeType === ("THREE_PL" as Role) && (
              <Card size="small" title="3PL settings" className="mb-4">
                <div className="flex gap-3">
                  <Form.Item label="Type" className="flex-1">
                    <Select
                      value={threePlFulfillmentType}
                      onChange={(v) => setThreePlFulfillmentType(v)}
                      options={[
                        { value: "STOCK", label: "Stock" },
                        { value: "DROPSHIP", label: "Dropshipping" },
                      ]}
                    />
                  </Form.Item>
                  {threePlFulfillmentType === ("STOCK" as ProductFulfillmentType) && (
                    <Form.Item label="Payout per order fulfilled" className="flex-1">
                      <InputNumber prefix="$" min={0} step={0.01} className="w-full" {...numProps(payoutPerOrder, setPayoutPerOrder)} />
                    </Form.Item>
                  )}
                </div>
                {threePlFulfillmentType === ("DROPSHIP" as ProductFulfillmentType) && (
                  <p className="mb-3 text-xs text-gray-500">
                    Dropshipping 3PLs have no fixed rate — they&apos;re paid the buy price they enter against each order.
                  </p>
                )}
                <Form.Item label="Billing cycle start day (1–28)" className="mb-0">
                  <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(billingCycleStartDay, setBillingCycleStartDay)} />
                </Form.Item>
              </Card>
            )}

            {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
            {successMessage && <Alert type="success" title={successMessage} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={submitting}>
              {submitting ? "Sending invite..." : `Send invite as ${activeMeta.label}`}
            </Button>
          </Form>
        </Card>
      </main>
    </>
  );
}
