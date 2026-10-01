"use client";

import { Currency, DEFAULT_CURRENCY, type CompanySubscriptionDto, type ProductFulfillmentType, type Role, type StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { CarOutlined, CheckCircleFilled, InboxOutlined, MailOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Switch, Tag } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import { getMyCompany, getSubscription, getToken, inviteUser } from "@/lib/api";
import { currencyOptions, currencySymbol } from "@/lib/currency";

// Every type counts against the company's subscription plan limits. Only the non-Staff types have a currency of their own.
const USER_TYPES: { role: Role; label: string; description: string; icon: ReactNode; hasCurrency: boolean }[] = [
  {
    role: "STAFF" as Role,
    label: "Staff",
    description: "An employee who manages orders, stock, users or invoices on your behalf.",
    icon: <TeamOutlined />,
    hasCurrency: false,
  },
  {
    role: "ACCOUNT_HOLDER" as Role,
    label: "Account Holder",
    description: "Earns a share of profit and is billed on a recurring cycle.",
    icon: <UserOutlined />,
    hasCurrency: true,
  },
  {
    role: "STOCK_OWNER" as Role,
    label: "Stock Owner",
    description: "Supplies stock and is paid a fixed amount or a share of margin.",
    icon: <InboxOutlined />,
    hasCurrency: true,
  },
  {
    role: "THREE_PL" as Role,
    label: "3PL",
    description: "A fulfillment partner paid per order fulfilled.",
    icon: <CarOutlined />,
    hasCurrency: true,
  },
];

const STAFF_PERMISSIONS = [
  { key: "canManageOrders", label: "Manage orders", hint: "Create, edit and update orders" },
  { key: "canManageStock", label: "Manage stock", hint: "Add products and adjust stock levels" },
  { key: "canManageUsers", label: "Manage users", hint: "Invite, edit and disable users" },
  { key: "canGenerateInvoices", label: "Generate invoices", hint: "Create and delete invoices" },
  { key: "canViewFinancials", label: "View financials", hint: "See profits, payouts and invoices" },
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
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);

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
  const [subscription, setSubscription] = useState<CompanySubscriptionDto | null>(null);

  function refreshSubscription() {
    getSubscription()
      .then(setSubscription)
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    // Preselect the company's default currency.
    getMyCompany()
      .then((c) => setCurrency(c.defaultCurrency ?? DEFAULT_CURRENCY))
      .catch(() => undefined);
    refreshSubscription();
  }, [router]);

  const usageFor = (role: Role) => subscription?.usage.find((u) => u.role === role) ?? null;

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
        // Staff have no amounts of their own — only paid roles enter money in their currency.
        currency: activeMeta.hasCurrency ? currency : undefined,
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
      refreshSubscription();
      setSuccessMessage(`Invited ${email} as ${label}. Pick another type above to invite the same person for another user type.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  const activeMeta = USER_TYPES.find((t) => t.role === activeType)!;
  const activeUsage = usageFor(activeType);
  const activeFull = !!activeUsage && activeUsage.used >= activeUsage.limit;

  const numProps = (value: string, set: (v: string) => void) => ({
    value: value === "" ? null : value,
    onChange: (v: string | number | null) => set(v == null ? "" : String(v)),
  });

  const billingDayField = (
    <Form.Item label="Billing cycle start day" tooltip="Day of the month (1–28) their billing cycle starts" className="mb-0">
      <InputNumber min={1} max={28} precision={0} prefix="Day" className="w-full" {...numProps(billingCycleStartDay, setBillingCycleStartDay)} />
    </Form.Item>
  );
  const enabledPermissions = STAFF_PERMISSIONS.filter(({ key }) => staffPermissions[key]).map(({ label }) => label);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8 pb-16">
        <BackLink href="/users" label="Users" title="Invite user" />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {USER_TYPES.map((type) => {
            const active = type.role === activeType;
            return (
              <button
                key={type.role}
                type="button"
                disabled={submitting}
                onClick={() => switchType(type.role)}
                className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 bg-white p-4 text-left transition hover:shadow-md disabled:cursor-not-allowed ${
                  active ? "border-[color:var(--btn-b)] shadow-md" : "border-transparent shadow-sm"
                }`}
              >
                {active && <CheckCircleFilled className="absolute right-3 top-3 text-lg text-[color:var(--btn-b)]" />}
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl text-lg ${
                    active ? "bg-[color:var(--btn-b)] text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {type.icon}
                </span>
                <span className="font-semibold text-slate-800">{type.label}</span>
                <span className="text-xs leading-relaxed text-slate-500">{type.description}</span>
                {usageFor(type.role) && (
                  <span>
                    <Tag color={usageFor(type.role)!.used >= usageFor(type.role)!.limit ? "red" : "default"} className="mr-0">
                      {usageFor(type.role)!.used} / {usageFor(type.role)!.limit} used
                    </Tag>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Form layout="vertical" onFinish={handleInvite} className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Card title="Person">
                <div className={`grid gap-x-4 gap-y-4 sm:grid-cols-2 ${activeMeta.hasCurrency ? "xl:grid-cols-3" : ""}`}>
                  <Form.Item label="Name" className="mb-0">
                    <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
                  </Form.Item>
                  <Form.Item
                    label="Email"
                    name="email"
                    rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
                    className="mb-0"
                  >
                    <Input
                      placeholder="name@example.com"
                      prefix={<MailOutlined className="text-slate-400" />}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </Form.Item>
                  {activeMeta.hasCurrency && (
                    <Form.Item label="Currency" tooltip="Their amounts are entered in this currency and converted to PKR on each order" className="mb-0">
                      <Select value={currency} onChange={setCurrency} options={currencyOptions} showSearch={{ optionFilterProp: "label" }} />
                    </Form.Item>
                  )}
                </div>
              </Card>

              {activeType === ("STAFF" as Role) && (
                <Card title="Permissions">
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
                    <div className="flex items-center justify-between gap-4 pb-0 pt-3">
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

              {activeType === ("ACCOUNT_HOLDER" as Role) && (
                <Card title="Account Holder terms">
                  <div className="grid gap-x-4 sm:grid-cols-3">
                    <Form.Item label="Share of profit" tooltip="Their cut of each order's profit" className="mb-0">
                      <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(sharePercent, setSharePercent)} />
                    </Form.Item>
                    <Form.Item label="3PL price charged" tooltip="Charged once per order shipped by a 3PL (optional)" className="mb-0">
                      <InputNumber prefix={currencySymbol(currency)} min={0} step={0.01} className="w-full" {...numProps(threePlPriceCharged, setThreePlPriceCharged)} />
                    </Form.Item>
                    {billingDayField}
                  </div>
                </Card>
              )}

              {activeType === ("STOCK_OWNER" as Role) && (
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
                        <InputNumber suffix="%" min={0} max={100} className="w-full" {...numProps(stockOwnerSharePercent, setStockOwnerSharePercent)} />
                      </Form.Item>
                    )}
                    {billingDayField}
                  </div>
                </Card>
              )}

              {activeType === ("THREE_PL" as Role) && (
                <Card title="3PL terms">
                  <div className="grid gap-x-4 sm:grid-cols-3">
                    <Form.Item label="Fulfillment type" className="mb-0">
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
                      <Form.Item label="Payout per order" tooltip="Paid once per order fulfilled" className="mb-0">
                        <InputNumber prefix={currencySymbol(currency)} min={0} step={0.01} className="w-full" {...numProps(payoutPerOrder, setPayoutPerOrder)} />
                      </Form.Item>
                    )}
                    {billingDayField}
                  </div>
                  {threePlFulfillmentType === ("DROPSHIP" as ProductFulfillmentType) && (
                    <p className="mb-0 mt-3 text-xs text-slate-500">
                      Dropshipping 3PLs have no fixed rate — they&apos;re paid the buy price they enter against each order.
                    </p>
                  )}
                </Card>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <Card title="Summary">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--btn-b)] text-lg text-white">
                    {activeMeta.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{name || email || "New user"}</div>
                    <div className="text-xs text-slate-500">Invited as {activeMeta.label}</div>
                  </div>
                </div>
                {activeType === ("STAFF" as Role) && (
                  <p className="mb-0 mt-4 text-sm text-slate-500">
                    {enabledPermissions.length ? `Can: ${enabledPermissions.join(", ")}.` : "No permissions selected yet."}
                  </p>
                )}
                <ul className="mb-0 mt-4 space-y-1 pl-4 text-xs text-slate-500">
                  <li>They get an email to set their password and sign in.</li>
                  {activeMeta.hasCurrency && <li>Their amounts are in {currency}, converted to PKR at the rate on each order.</li>}
                  {subscription && <li>Uses one of the {subscription.plan.name} plan&apos;s {activeMeta.label} accounts.</li>}
                  <li>To give the same person another role, invite them again under that type.</li>
                </ul>
              </Card>

              <Card>
                {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
                {successMessage && <Alert type="success" title={successMessage} className="mb-4" showIcon />}
                {activeFull && (
                  <Alert
                    type="warning"
                    className="mb-4"
                    showIcon
                    title={`All ${activeUsage!.limit} ${activeMeta.label} accounts on your ${subscription!.plan.name} plan are in use`}
                    description={
                      <>
                        <Link href="/subscription">Upgrade your subscription</Link> or disable another {activeMeta.label} first.
                      </>
                    }
                  />
                )}
                <Button type="primary" htmlType="submit" loading={submitting} disabled={activeFull} block size="large">
                  {submitting ? "Sending invite..." : `Send invite as ${activeMeta.label}`}
                </Button>
              </Card>
            </div>
          </div>
        </Form>
      </main>
    </>
  );
}
