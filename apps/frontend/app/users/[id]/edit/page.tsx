"use client";

import type { ProductFulfillmentType, StockOwnerPayoutMode, UserDto } from "@ebay-order-management/shared";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  getToken,
  getUser,
  updateAccountHolderProfile,
  updateStaffPermissions,
  updateStockOwnerProfile,
  updateThreePlProfile,
  updateUser,
} from "@/lib/api";

const STAFF_PERMISSIONS = [
  { key: "canManageOrders", label: "Manage orders" },
  { key: "canManageStock", label: "Manage stock" },
  { key: "canManageUsers", label: "Manage users" },
  { key: "canGenerateInvoices", label: "Generate invoices" },
  { key: "canViewFinancials", label: "View financials" },
] as const;

type StaffPermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];
type StaffPermissionsState = Record<StaffPermissionKey, boolean>;

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<UserDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");

  const [staffPermissions, setStaffPermissions] = useState<StaffPermissionsState>({
    canManageOrders: false,
    canManageStock: false,
    canManageUsers: false,
    canGenerateInvoices: false,
    canViewFinancials: false,
  });
  const [hasRevenueShare, setHasRevenueShare] = useState(false);
  const [staffSharePercent, setStaffSharePercent] = useState("0");

  const [ahSharePercent, setAhSharePercent] = useState("0");
  const [ahThreePlPriceCharged, setAhThreePlPriceCharged] = useState("");
  const [ahBillingCycleStartDay, setAhBillingCycleStartDay] = useState("1");

  const [payoutMode, setPayoutMode] = useState<StockOwnerPayoutMode>("FIXED" as StockOwnerPayoutMode);
  const [soSharePercent, setSoSharePercent] = useState("0");
  const [soBillingCycleStartDay, setSoBillingCycleStartDay] = useState("1");

  const [fulfillmentType, setFulfillmentType] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);
  const [payoutPerOrder, setPayoutPerOrder] = useState("0");
  const [tpBillingCycleStartDay, setTpBillingCycleStartDay] = useState("1");

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    getUser(userId)
      .then((u) => {
        setUser(u);
        setName(u.name ?? "");
        if (u.staffProfile) {
          setStaffPermissions({
            canManageOrders: u.staffProfile.canManageOrders,
            canManageStock: u.staffProfile.canManageStock,
            canManageUsers: u.staffProfile.canManageUsers,
            canGenerateInvoices: u.staffProfile.canGenerateInvoices,
            canViewFinancials: u.staffProfile.canViewFinancials,
          });
          setHasRevenueShare(u.staffProfile.hasRevenueShare);
          setStaffSharePercent(String(u.staffProfile.sharePercent ?? 0));
        }
        if (u.accountHolderProfile) {
          setAhSharePercent(String(u.accountHolderProfile.sharePercent));
          setAhThreePlPriceCharged(
            u.accountHolderProfile.threePlPriceCharged != null ? String(u.accountHolderProfile.threePlPriceCharged) : "",
          );
          setAhBillingCycleStartDay(String(u.accountHolderProfile.billingCycleStartDay));
        }
        if (u.stockOwnerProfile) {
          setPayoutMode(u.stockOwnerProfile.payoutMode);
          setSoSharePercent(String(u.stockOwnerProfile.sharePercent ?? 0));
          setSoBillingCycleStartDay(String(u.stockOwnerProfile.billingCycleStartDay));
        }
        if (u.threePlProfile) {
          setFulfillmentType(u.threePlProfile.fulfillmentType);
          setPayoutPerOrder(String(u.threePlProfile.payoutPerOrder));
          setTpBillingCycleStartDay(String(u.threePlProfile.billingCycleStartDay));
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load user"));
  }, [router, userId]);

  async function handleSubmit() {
    if (!user) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (name !== (user.name ?? "")) {
        await updateUser(userId, { name });
      }
      if (user.staffProfile) {
        await updateStaffPermissions(userId, {
          ...staffPermissions,
          hasRevenueShare,
          sharePercent: hasRevenueShare ? Number(staffSharePercent) : null,
        });
      }
      if (user.accountHolderProfile) {
        await updateAccountHolderProfile(userId, {
          sharePercent: Number(ahSharePercent),
          threePlPriceCharged: ahThreePlPriceCharged ? Number(ahThreePlPriceCharged) : null,
          billingCycleStartDay: Number(ahBillingCycleStartDay),
        });
      }
      if (user.stockOwnerProfile) {
        await updateStockOwnerProfile(userId, {
          payoutMode,
          sharePercent: payoutMode === ("PROFIT_SHARE" as StockOwnerPayoutMode) ? Number(soSharePercent) : null,
          billingCycleStartDay: Number(soBillingCycleStartDay),
        });
      }
      if (user.threePlProfile) {
        await updateThreePlProfile(userId, {
          fulfillmentType,
          payoutPerOrder: fulfillmentType === ("STOCK" as ProductFulfillmentType) ? Number(payoutPerOrder) : undefined,
          billingCycleStartDay: Number(tpBillingCycleStartDay),
        });
      }
      router.push("/users");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save user");
      setSubmitting(false);
    }
  }

  const numProps = (value: string, set: (v: string) => void) => ({
    value: value === "" ? null : value,
    onChange: (v: string | number | null) => set(v == null ? "" : String(v)),
  });

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-2xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit user</h1>
          <Button onClick={() => router.push("/users")}>Back to users</Button>
        </div>

        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        {user && (
          <Card className="mt-6">
            <Form layout="vertical" onFinish={handleSubmit}>
              <div className="flex gap-3">
                <Form.Item label="Name" className="flex-1">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </Form.Item>
                <Form.Item label="Email" className="flex-1">
                  <Input value={user.email} disabled />
                </Form.Item>
              </div>

              <p className="mb-4 text-gray-600">
                Roles:{" "}
                {user.roles.map((r) => (
                  <Tag key={r}>{r}</Tag>
                ))}
              </p>

              {user.staffProfile && (
                <Card size="small" title="Staff permissions" className="mb-4">
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

              {user.accountHolderProfile && (
                <Card size="small" title="Account Holder settings" className="mb-4">
                  <div className="flex gap-3">
                    <Form.Item label="Share % of profit" className="flex-1">
                      <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(ahSharePercent, setAhSharePercent)} />
                    </Form.Item>
                    <Form.Item label="3PL price charged (optional)" className="flex-1">
                      <InputNumber prefix="$" min={0} step={0.01} className="w-full" {...numProps(ahThreePlPriceCharged, setAhThreePlPriceCharged)} />
                    </Form.Item>
                  </div>
                  <Form.Item label="Billing cycle start day (1–28)" className="mb-0">
                    <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(ahBillingCycleStartDay, setAhBillingCycleStartDay)} />
                  </Form.Item>
                </Card>
              )}

              {user.stockOwnerProfile && (
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
                        <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(soSharePercent, setSoSharePercent)} />
                      </Form.Item>
                    )}
                  </div>
                  <Form.Item label="Billing cycle start day (1–28)" className="mb-0">
                    <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(soBillingCycleStartDay, setSoBillingCycleStartDay)} />
                  </Form.Item>
                </Card>
              )}

              {user.threePlProfile && (
                <Card size="small" title="3PL settings" className="mb-4">
                  <div className="flex gap-3">
                    <Form.Item label="Type" className="flex-1">
                      <Select
                        value={fulfillmentType}
                        onChange={(v) => setFulfillmentType(v)}
                        options={[
                          { value: "STOCK", label: "Stock" },
                          { value: "DROPSHIP", label: "Dropshipping" },
                        ]}
                      />
                    </Form.Item>
                    {fulfillmentType === ("STOCK" as ProductFulfillmentType) && (
                      <Form.Item label="Payout per order fulfilled" className="flex-1">
                        <InputNumber prefix="$" min={0} step={0.01} className="w-full" {...numProps(payoutPerOrder, setPayoutPerOrder)} />
                      </Form.Item>
                    )}
                  </div>
                  {fulfillmentType === ("DROPSHIP" as ProductFulfillmentType) && (
                    <p className="mb-3 text-xs text-gray-500">
                      Dropshipping 3PLs have no fixed rate — they&apos;re paid the buy price they enter against each order.
                    </p>
                  )}
                  <Form.Item label="Billing cycle start day (1–28)" className="mb-0">
                    <InputNumber min={1} max={28} precision={0} className="w-full" {...numProps(tpBillingCycleStartDay, setTpBillingCycleStartDay)} />
                  </Form.Item>
                </Card>
              )}

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting}>
                {submitting ? "Saving..." : "Save changes"}
              </Button>
            </Form>
          </Card>
        )}
      </main>
    </>
  );
}
