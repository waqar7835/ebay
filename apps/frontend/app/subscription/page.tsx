"use client";

import { CheckCircleFilled, CheckOutlined } from "@ant-design/icons";
import type { BillingPeriodDto, CompanySubscriptionDto, SubscriptionPaymentDto, SubscriptionPlanDto } from "@ebay-order-management/shared";
import { Alert, Button, Card, Form, Input, Progress, Segmented, Table, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import FileUpload from "@/components/FileUpload";
import { roleLabel } from "@/components/RoleTag";
import {
  getSubscription,
  getToken,
  listBillingPeriods,
  listSubscriptionPayments,
  listSubscriptionPlans,
  mediaUrl,
  submitSubscriptionPayment,
  subscriptionPrice,
} from "@/lib/api";
import { pkr } from "@/lib/currency";

const PAYMENT_STATUS_COLOR: Record<string, string> = { SUBMITTED: "blue", APPROVED: "green", REJECTED: "red" };

function durationLabel(months: number) {
  if (months % 12 === 0) return months === 12 ? "1 year" : `${months / 12} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

function planLimits(plan: SubscriptionPlanDto) {
  return [
    { label: roleLabel("ACCOUNT_HOLDER"), value: plan.maxAccountHolders },
    { label: roleLabel("STOCK_OWNER"), value: plan.maxStockOwners },
    { label: roleLabel("THREE_PL"), value: plan.maxThreePls },
    { label: roleLabel("STAFF"), value: plan.maxStaff },
  ];
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<CompanySubscriptionDto | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [periods, setPeriods] = useState<BillingPeriodDto[]>([]);
  const [payments, setPayments] = useState<SubscriptionPaymentDto[]>([]);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [referenceNote, setReferenceNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    getSubscription()
      .then(setSubscription)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    listSubscriptionPayments()
      .then(setPayments)
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    refresh();
    listSubscriptionPlans()
      .then(setPlans)
      .catch(() => undefined);
    listBillingPeriods()
      .then((p) => {
        setPeriods(p);
        // Default to the longest (usually best-value) period.
        if (p.length) setPeriodId(p[p.length - 1].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const paidPlans = plans.filter((p) => !p.isFree);
  const period = periods.find((p) => p.id === periodId) ?? null;
  const plan = paidPlans.find((p) => p.id === planId) ?? null;
  const price = plan && period ? subscriptionPrice(plan, period) : null;
  const pending = subscription?.pendingPayment ?? null;
  const currentPlan = subscription?.plan;
  const renewsSamePlan = !!plan && !!currentPlan && !currentPlan.isFree && plan.id === currentPlan.id;

  const periodOptions = useMemo(
    () =>
      periods.map((p) => ({
        value: p.id,
        label: (
          <span className="px-2">
            {durationLabel(p.months)}
            {p.discountPercent > 0 && (
              <Tag color="green" className="ml-2 mr-0">
                Save {Number(p.discountPercent)}%
              </Tag>
            )}
          </span>
        ),
      })),
    [periods],
  );

  async function handleSubmit() {
    if (!plan || !period || !receipt) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await submitSubscriptionPayment(plan.id, period.id, referenceNote, receipt);
      setMessage("Payment submitted. Your plan is activated as soon as it's approved.");
      setPlanId(null);
      setReceipt(null);
      setReferenceNote("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Subscription</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your plan sets how many Account Holder, Stock Owner, 3PL and Staff accounts your company can have. Your own Admin
          account is always free.
        </p>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}
        {message && <Alert type="success" title={message} className="mt-4" showIcon />}
        {pending && (
          <Alert
            type="info"
            className="mt-4"
            showIcon
            title={`Payment under review: ${pending.planName}, ${durationLabel(pending.months)} — ${pkr(pending.amount)}`}
            description="You can submit another payment once this one has been reviewed."
          />
        )}
        {subscription?.daysLeft != null && subscription.daysLeft <= 5 && (
          <Alert
            type="warning"
            className="mt-4"
            showIcon
            title={`Your subscription ends ${subscription.daysLeft === 0 ? "today" : subscription.daysLeft === 1 ? "tomorrow" : `in ${subscription.daysLeft} days`}`}
            description="When it expires every account except yours is deactivated, and you can only re-enable as many as the free plan allows. Renew below to avoid that."
          />
        )}

        {subscription && currentPlan && (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="kpi-hero">
              <div className="text-sm opacity-80">Current plan</div>
              <div className="mt-1 text-2xl font-semibold">{currentPlan.name}</div>
              <div className="mt-2 text-sm opacity-90">
                {subscription.endsAt
                  ? `Active until ${new Date(`${subscription.endsAt}T00:00:00`).toLocaleDateString()} · ${subscription.daysLeft} day${subscription.daysLeft === 1 ? "" : "s"} left`
                  : "Free plan — no expiry"}
              </div>
            </Card>
            <Card className="lg:col-span-2" title="Accounts in use">
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {subscription.usage.map((u) => (
                  <div key={u.role}>
                    <div className="flex justify-between text-sm">
                      <span>{roleLabel(u.role)}</span>
                      <span className="text-gray-500">
                        {u.used} / {u.limit}
                      </span>
                    </div>
                    <Progress
                      percent={u.limit ? Math.min(100, (u.used / u.limit) * 100) : 100}
                      showInfo={false}
                      status={u.used >= u.limit ? "exception" : "normal"}
                      size="small"
                    />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <h2 className="mt-8 text-lg font-medium">Choose a plan</h2>
        {periods.length > 0 && (
          <Segmented className="mt-3" value={periodId ?? undefined} onChange={(v) => setPeriodId(v as string)} options={periodOptions} />
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {period &&
            paidPlans.map((p) => {
              const pp = subscriptionPrice(p, period);
              const selected = p.id === planId;
              const isCurrent = currentPlan?.id === p.id;
              return (
                <Card
                  key={p.id}
                  hoverable
                  onClick={() => setPlanId(p.id)}
                  className={selected ? "border-2" : ""}
                  style={selected ? { borderColor: "var(--ant-color-primary)" } : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-lg font-semibold">{p.name}</div>
                    {isCurrent && <Tag color="blue">Current</Tag>}
                  </div>
                  {p.description && <div className="mt-1 text-sm text-gray-500">{p.description}</div>}
                  <div className="mt-4">
                    <span className="text-2xl font-semibold">{pkr(pp.total)}</span>
                    <span className="text-sm text-gray-500"> / {durationLabel(period.months)}</span>
                  </div>
                  <div className="h-5 text-xs text-gray-500">
                    {period.discountPercent > 0 ? (
                      <>
                        <s>{pkr(pp.subtotal)}</s> · {pkr(pp.perMonth)} per month
                      </>
                    ) : period.months > 1 ? (
                      `${pkr(pp.perMonth)} per month`
                    ) : null}
                  </div>
                  <ul className="mt-4 space-y-1 text-sm">
                    {planLimits(p).map((l) => (
                      <li key={l.label}>
                        <CheckOutlined className="mr-2 text-green-600" />
                        {l.value} {l.label}
                        {l.value === 1 || l.label === "Staff" ? "" : "s"}
                      </li>
                    ))}
                  </ul>
                  <Button block className="mt-4" type={selected ? "primary" : "default"} icon={selected ? <CheckCircleFilled /> : undefined}>
                    {selected ? "Selected" : isCurrent ? "Renew" : "Select"}
                  </Button>
                </Card>
              );
            })}
        </div>
        {paidPlans.length === 0 && <p className="mt-4 text-sm text-gray-500">No paid plans are available right now.</p>}

        {plan && period && price && (
          <Card className="mt-6" title={`Pay for ${plan.name} — ${durationLabel(period.months)}`}>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="text-sm">
                <div className="flex justify-between py-1">
                  <span>
                    {pkr(plan.pricePerMonth)} × {period.months} month{period.months === 1 ? "" : "s"}
                  </span>
                  <span>{pkr(price.subtotal)}</span>
                </div>
                {period.discountPercent > 0 && (
                  <div className="flex justify-between py-1 text-green-700">
                    <span>{Number(period.discountPercent)}% discount</span>
                    <span>− {pkr(price.subtotal - price.total)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span>{pkr(price.total)}</span>
                </div>
                <p className="mt-4 text-gray-500">
                  {renewsSamePlan
                    ? `Renewing adds ${durationLabel(period.months)} after your current end date.`
                    : currentPlan && !currentPlan.isFree
                      ? `Switching plans starts the new plan on approval; time left on ${currentPlan.name} isn't carried over.`
                      : "The plan starts as soon as the payment is approved."}
                </p>
              </div>
              <Form layout="vertical" onFinish={handleSubmit}>
                <Form.Item label="Payment receipt" required>
                  <FileUpload value={receipt} onChange={setReceipt} label="Select receipt" />
                </Form.Item>
                <Form.Item label="Reference note (optional)">
                  <Input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} placeholder="e.g. bank transfer ID" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting} disabled={!receipt || !!pending}>
                  Submit payment for approval
                </Button>
              </Form>
            </div>
          </Card>
        )}

        <h2 className="mt-8 text-lg font-medium">Payment history</h2>
        <Table<SubscriptionPaymentDto>
          className="mt-4"
          rowKey="id"
          size="small"
          dataSource={payments}
          pagination={false}
          locale={{ emptyText: "No payments yet." }}
          columns={[
            { title: "Submitted", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString() },
            { title: "Plan", dataIndex: "planName" },
            { title: "Duration", dataIndex: "months", render: (m: number) => durationLabel(m) },
            {
              title: "Amount",
              dataIndex: "amount",
              render: (v: number, p) => (
                <>
                  {pkr(v)}
                  {Number(p.discountPercent) > 0 && <span className="text-xs text-gray-500"> ({Number(p.discountPercent)}% off)</span>}
                </>
              ),
            },
            {
              title: "Covers",
              key: "period",
              render: (_, p) => (p.periodStart && p.periodEnd ? `${p.periodStart} → ${p.periodEnd}` : "—"),
            },
            { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={PAYMENT_STATUS_COLOR[s]}>{s}</Tag> },
            {
              title: "Receipt",
              dataIndex: "receiptFileUrl",
              render: (url: string | null) =>
                url ? (
                  <a href={mediaUrl(url)} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </main>
    </>
  );
}
