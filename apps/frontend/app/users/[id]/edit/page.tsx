"use client";

import { DEFAULT_CURRENCY, type Currency, type ProductFulfillmentType, type StockOwnerPayoutMode, type UserDto } from "@ebay-order-management/shared";
import { MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Switch, Tag } from "antd";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import RoleTag from "@/components/RoleTag";
import {
  getToken,
  getUser,
  updateAccountHolderProfile,
  updateStaffPermissions,
  updateStockOwnerProfile,
  updateThreePlProfile,
  updateUser,
  uploadUserAvatar,
} from "@/lib/api";
import AvatarUpload from "@/components/AvatarUpload";
import { currencyOptions, currencySymbol } from "@/lib/currency";

const STAFF_PERMISSIONS = [
  { key: "canManageOrders", label: "Manage orders", hint: "Create, edit and update orders" },
  { key: "canManageStock", label: "Manage stock", hint: "Add products and adjust stock levels" },
  { key: "canManageUsers", label: "Manage users", hint: "Invite, edit and disable users" },
  { key: "canGenerateInvoices", label: "Generate invoices", hint: "Create and delete invoices" },
  { key: "canViewFinancials", label: "View financials", hint: "See profits, payouts and invoices" },
] as const;

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: "green", label: "Active" },
  INVITED: { color: "blue", label: "Invite pending" },
  DISABLED: { color: "default", label: "Disabled" },
};

type StaffPermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];
type StaffPermissionsState = Record<StaffPermissionKey, boolean>;

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<UserDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);

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
        setCurrency(u.currency ?? DEFAULT_CURRENCY);
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
      const currencyChanged = hasAmounts && currency !== user.currency;
      if (name !== (user.name ?? "") || currencyChanged) {
        await updateUser(userId, { name, ...(currencyChanged ? { currency } : {}) });
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

  // Only Account Holders, Stock Owners and 3PLs enter amounts in their own currency.
  const hasAmounts = !!(user?.accountHolderProfile || user?.stockOwnerProfile || user?.threePlProfile);

  const numProps = (value: string, set: (v: string) => void) => ({
    value: value === "" ? null : value,
    onChange: (v: string | number | null) => set(v == null ? "" : String(v)),
  });

  const billingDayField = (value: string, set: (v: string) => void) => (
    <Form.Item label="Billing cycle start day" tooltip="Day of the month (1–28) their billing cycle starts" className="mb-0">
      <InputNumber min={1} max={28} precision={0} prefix="Day" className="w-full" {...numProps(value, set)} />
    </Form.Item>
  );
  const displayName = user?.name || user?.email || "";
  const initials =
    displayName
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const status = user ? (STATUS_TAG[user.status] ?? { color: "default", label: user.status }) : null;

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8 pb-16">
        <BackLink href="/users" label="Users" title="Edit user" />

        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        {user && (
          <Form layout="vertical" onFinish={handleSubmit} className="mt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                <Card title="Person">
                  <div className={`grid gap-x-4 gap-y-4 sm:grid-cols-2 ${hasAmounts ? "xl:grid-cols-3" : ""}`}>
                    <Form.Item label="Name" className="mb-0">
                      <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
                    </Form.Item>
                    <Form.Item label="Email" tooltip="The sign-in email can't be changed" className="mb-0">
                      <Input value={user.email} disabled prefix={<MailOutlined className="text-slate-400" />} />
                    </Form.Item>
                    {hasAmounts && (
                      <Form.Item
                        label="Currency"
                        tooltip="Their amounts are entered in this currency. Changing it affects new orders only — re-enter their fee/prices in the new currency"
                        className="mb-0"
                      >
                        <Select value={currency} onChange={setCurrency} options={currencyOptions} showSearch={{ optionFilterProp: "label" }} />
                      </Form.Item>
                    )}
                  </div>
                  {hasAmounts && currency !== user.currency && (
                    <Alert
                      type="warning"
                      showIcon
                      className="mt-4"
                      title={`Existing orders stay in ${user.currency}. Re-enter this user's fees and product prices in ${currency}.`}
                    />
                  )}
                </Card>

                {user.staffProfile && (
                  <Card title="Staff permissions">
                    <div className="divide-y divide-slate-100">
                      {STAFF_PERMISSIONS.map(({ key, label, hint }) => (
                        <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0">
                          <span>
                            <span className="block font-medium text-slate-800">{label}</span>
                            <span className="block text-xs text-slate-500">{hint}</span>
                          </span>
                          <Switch
                            checked={staffPermissions[key]}
                            onChange={(checked) => setStaffPermissions((prev) => ({ ...prev, [key]: checked }))}
                          />
                        </label>
                      ))}
                      <div className="flex items-center justify-between gap-4 pt-3">
                        <label className="cursor-pointer" htmlFor="revenue-share">
                          <span className="block font-medium text-slate-800">Revenue share</span>
                          <span className="block text-xs text-slate-500">Earns a percentage of total company profit</span>
                        </label>
                        <div className="flex items-center gap-3">
                          {hasRevenueShare && (
                            <InputNumber suffix="%" min={0} max={100} className="w-28" {...numProps(staffSharePercent, setStaffSharePercent)} />
                          )}
                          <Switch id="revenue-share" checked={hasRevenueShare} onChange={setHasRevenueShare} />
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {user.accountHolderProfile && (
                  <Card title="Account Holder terms">
                    <div className="grid gap-x-4 sm:grid-cols-3">
                      <Form.Item label="Share of profit" tooltip="Their cut of each order's profit" className="mb-0">
                        <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(ahSharePercent, setAhSharePercent)} />
                      </Form.Item>
                      <Form.Item label="3PL price charged" tooltip="Charged once per order shipped by a 3PL (optional)" className="mb-0">
                        <InputNumber prefix={currencySymbol(currency)} min={0} step={0.01} className="w-full" {...numProps(ahThreePlPriceCharged, setAhThreePlPriceCharged)} />
                      </Form.Item>
                      {billingDayField(ahBillingCycleStartDay, setAhBillingCycleStartDay)}
                    </div>
                  </Card>
                )}

                {user.stockOwnerProfile && (
                  <Card title="Stock Owner terms">
                    <div className="grid gap-x-4 sm:grid-cols-3">
                      <Form.Item label="Payout mode" className="mb-0">
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
                        <Form.Item label="Share of their margin" tooltip="The company keeps this % of (buy price − their cost)" className="mb-0">
                          <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(soSharePercent, setSoSharePercent)} />
                        </Form.Item>
                      )}
                      {billingDayField(soBillingCycleStartDay, setSoBillingCycleStartDay)}
                    </div>
                  </Card>
                )}

                {user.threePlProfile && (
                  <Card title="3PL terms">
                    <div className="grid gap-x-4 sm:grid-cols-3">
                      <Form.Item label="Fulfillment type" className="mb-0">
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
                        <Form.Item label="Payout per order" tooltip="Paid once per order fulfilled" className="mb-0">
                          <InputNumber prefix={currencySymbol(currency)} min={0} step={0.01} className="w-full" {...numProps(payoutPerOrder, setPayoutPerOrder)} />
                        </Form.Item>
                      )}
                      {billingDayField(tpBillingCycleStartDay, setTpBillingCycleStartDay)}
                    </div>
                    {fulfillmentType === ("DROPSHIP" as ProductFulfillmentType) && (
                      <p className="mb-0 mt-3 text-xs text-slate-500">
                        Dropshipping 3PLs have no fixed rate — they&apos;re paid the buy price they enter against each order.
                      </p>
                    )}
                  </Card>
                )}
              </div>

              <div className="flex flex-col gap-6">
                <Card>
                  <div className="flex flex-col items-center text-center">
                    <AvatarUpload
                      url={user.avatarUrl}
                      initials={initials}
                      className="bg-[color:var(--btn-b)] text-2xl"
                      onUpload={async (file) => {
                        setAvatarError(null);
                        setUser(await uploadUserAvatar(user.id, file));
                      }}
                      onError={setAvatarError}
                    />
                    {avatarError && <Alert type="error" title={avatarError} className="mt-3 text-left" showIcon />}
                    <div className="mt-3 max-w-full truncate text-lg font-semibold text-slate-800">{name || user.email}</div>
                    <div className="max-w-full truncate text-sm text-slate-500">{user.email}</div>
                    <div className="mt-3 flex flex-wrap justify-center gap-1">
                      {user.roles.map((r) => (
                        <RoleTag key={r} role={r} />
                      ))}
                    </div>
                    {status && (
                      <Tag color={status.color} className="mr-0 mt-3">
                        {status.label}
                      </Tag>
                    )}
                  </div>
                  <p className="mb-0 mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                    Share and fee changes apply to new orders — existing orders keep the rates they were created with.
                  </p>
                </Card>

                <Card>
                  {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
                  <Button type="primary" htmlType="submit" loading={submitting} block size="large">
                    {submitting ? "Saving..." : "Save changes"}
                  </Button>
                </Card>
              </div>
            </div>
          </Form>
        )}
      </main>
    </>
  );
}
