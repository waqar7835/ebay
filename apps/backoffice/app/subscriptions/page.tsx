"use client";

import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { SubscriptionPaymentStatus, type BillingPeriodDto, type Role, type SubscriptionPaymentDto, type SubscriptionPlanDto } from "@ebay-order-management/shared";
import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Switch, Table, Tabs, Tag, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import DateField from "@/components/DateField";
import {
  assignSubscriptionPlan,
  createBillingPeriod,
  createSubscriptionPlan,
  deleteBillingPeriod,
  deleteSubscriptionPlan,
  getStoredUser,
  getToken,
  listAllCompanies,
  listBillingPeriods,
  listSubscriptionPayments,
  listSubscriptionPlans,
  reviewSubscriptionPayment,
  updateBillingPeriod,
  updateSubscriptionPlan,
  type BillingPeriodInput,
  type PlanInput,
} from "@/lib/api";
import { pkr } from "@/lib/currency";
import { searchable } from "@/lib/selectOptions";

const PAYMENT_STATUS_COLOR: Record<string, string> = { SUBMITTED: "blue", APPROVED: "green", REJECTED: "red" };

type Company = Awaited<ReturnType<typeof listAllCompanies>>[number];

function durationLabel(months: number) {
  if (months % 12 === 0) return months === 12 ? "1 year" : `${months / 12} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

const EMPTY_PLAN: PlanInput = {
  name: "",
  description: null,
  pricePerMonth: 0,
  maxAccountHolders: 0,
  maxStockOwners: 0,
  maxThreePls: 0,
  maxStaff: 0,
  isActive: true,
  sortOrder: 0,
};

export default function SubscriptionsPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payments, setPayments] = useState<SubscriptionPaymentDto[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<"SUBMITTED" | "ALL">("SUBMITTED");
  const [plans, setPlans] = useState<SubscriptionPlanDto[]>([]);
  const [periods, setPeriods] = useState<BillingPeriodDto[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Plan modal: null = closed, "new" = create, otherwise the plan being edited.
  const [planEditing, setPlanEditing] = useState<SubscriptionPlanDto | "new" | null>(null);
  const [planForm] = Form.useForm<PlanInput>();
  const [periodEditing, setPeriodEditing] = useState<BillingPeriodDto | "new" | null>(null);
  const [periodForm] = Form.useForm<BillingPeriodInput>();
  const [assigning, setAssigning] = useState<Company | null>(null);
  const [assignPlanId, setAssignPlanId] = useState<string | null>(null);
  const [assignEndsAt, setAssignEndsAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong");

  function refreshPayments(filter = paymentFilter) {
    listSubscriptionPayments(filter === "ALL" ? undefined : SubscriptionPaymentStatus.SUBMITTED)
      .then(setPayments)
      .catch(fail);
  }
  function refreshPlans() {
    listSubscriptionPlans().then(setPlans).catch(fail);
  }
  function refreshPeriods() {
    listBillingPeriods().then(setPeriods).catch(fail);
  }
  function refreshCompanies() {
    listAllCompanies().then(setCompanies).catch(fail);
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!getToken() || !user) {
      router.push("/");
      return;
    }
    setIsSuperAdmin(user.roles.includes("SUPER_ADMIN" as Role));
    refreshPayments();
    refreshPlans();
    refreshPeriods();
    refreshCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function review(id: string, approve: boolean) {
    setError(null);
    try {
      await reviewSubscriptionPayment(id, approve);
      refreshPayments();
      refreshCompanies();
    } catch (err) {
      fail(err);
    }
  }

  // The modal's form mounts on open (destroyOnHidden), so values go in via initialValues.
  const planInitialValues = planEditing === "new" ? { ...EMPTY_PLAN, sortOrder: plans.length } : (planEditing ?? undefined);
  const periodInitialValues = periodEditing === "new" ? { months: 1, discountPercent: 0, isActive: true } : (periodEditing ?? undefined);

  async function savePlan() {
    const values = await planForm.validateFields();
    setSaving(true);
    setError(null);
    try {
      if (planEditing === "new") await createSubscriptionPlan(values);
      else if (planEditing) await updateSubscriptionPlan(planEditing.id, values);
      setPlanEditing(null);
      refreshPlans();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function savePeriod() {
    const values = await periodForm.validateFields();
    setSaving(true);
    setError(null);
    try {
      if (periodEditing === "new") await createBillingPeriod(values);
      else if (periodEditing) await updateBillingPeriod(periodEditing.id, values);
      setPeriodEditing(null);
      refreshPeriods();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!assigning || !assignPlanId) return;
    setSaving(true);
    setError(null);
    try {
      await assignSubscriptionPlan(assigning.id, assignPlanId, assignEndsAt ?? undefined);
      setAssigning(null);
      refreshCompanies();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  const editingFreePlan = planEditing !== null && planEditing !== "new" && planEditing.isFree;
  const assignPlan = plans.find((p) => p.id === assignPlanId);
  const pendingCount = paymentFilter === "SUBMITTED" ? payments.length : payments.filter((p) => p.status === "SUBMITTED").length;
  const today = new Date().toISOString().slice(0, 10);

  const paymentsTab = (
    <>
      <Segmented
        value={paymentFilter}
        onChange={(v) => {
          setPaymentFilter(v as "SUBMITTED" | "ALL");
          refreshPayments(v as "SUBMITTED" | "ALL");
        }}
        options={[
          { value: "SUBMITTED", label: "Awaiting review" },
          { value: "ALL", label: "All payments" },
        ]}
      />
      <Table<SubscriptionPaymentDto>
        className="mt-4"
        rowKey="id"
        size="small"
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        dataSource={payments}
        locale={{ emptyText: paymentFilter === "SUBMITTED" ? "Nothing waiting for review." : "No payments yet." }}
        columns={[
          { title: "Company", dataIndex: "companyName" },
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
          { title: "Reference", dataIndex: "referenceNote", render: (v: string | null) => v || "—" },
          {
            title: "Receipt",
            dataIndex: "receiptFileUrl",
            render: (url: string | null) =>
              url ? (
                <a href={/^https?:\/\//.test(url) ? url : `${process.env.NEXT_PUBLIC_API_URL}${url}`} target="_blank" rel="noreferrer">
                  View
                </a>
              ) : (
                "—"
              ),
          },
          {
            title: "Status",
            dataIndex: "status",
            render: (s: string, p) => (
              <>
                <Tag color={PAYMENT_STATUS_COLOR[s]}>{s}</Tag>
                {p.periodStart && p.periodEnd && (
                  <span className="text-xs text-gray-500">
                    {p.periodStart} → {p.periodEnd}
                  </span>
                )}
              </>
            ),
          },
          {
            key: "actions",
            render: (_, p) =>
              isSuperAdmin && p.status === "SUBMITTED" ? (
                <Space size="small">
                  <Popconfirm title="Approve this payment and activate the plan?" onConfirm={() => review(p.id, true)}>
                    <Button size="small" type="primary" icon={<CheckOutlined />}>
                      Approve
                    </Button>
                  </Popconfirm>
                  <Popconfirm title="Reject this payment?" onConfirm={() => review(p.id, false)}>
                    <Button size="small" danger icon={<CloseOutlined />}>
                      Reject
                    </Button>
                  </Popconfirm>
                </Space>
              ) : null,
          },
        ]}
      />
    </>
  );

  const plansTab = (
    <>
      {isSuperAdmin && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setPlanEditing("new")}>
          New plan
        </Button>
      )}
      <Table<SubscriptionPlanDto>
        className="mt-4"
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={plans}
        columns={[
          {
            title: "Plan",
            dataIndex: "name",
            render: (name: string, p) => (
              <>
                <div className="font-medium">
                  {name} {p.isFree && <Tag color="green">Free fallback</Tag>}
                  {!p.isActive && <Tag>Inactive</Tag>}
                </div>
                {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
              </>
            ),
          },
          { title: "Price / month", dataIndex: "pricePerMonth", render: (v: number) => (v ? pkr(v) : "Free") },
          { title: "Account Holders", dataIndex: "maxAccountHolders" },
          { title: "Stock Owners", dataIndex: "maxStockOwners" },
          { title: "3PLs", dataIndex: "maxThreePls" },
          { title: "Staff", dataIndex: "maxStaff" },
          { title: "Order", dataIndex: "sortOrder" },
          {
            key: "actions",
            render: (_, p) =>
              isSuperAdmin ? (
                <Space size={2}>
                  <Tooltip title="Edit">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setPlanEditing(p)} />
                  </Tooltip>
                  {!p.isFree && (
                    <Popconfirm
                      title={`Delete ${p.name}?`}
                      description="Plans that were ever subscribed to can't be deleted — deactivate them instead."
                      okButtonProps={{ danger: true }}
                      onConfirm={() => deleteSubscriptionPlan(p.id).then(refreshPlans).catch(fail)}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ) : null,
          },
        ]}
      />
    </>
  );

  const periodsTab = (
    <>
      <p className="text-sm text-gray-500">
        The durations companies can pay for. Every paid plan is offered under each active duration, priced at the monthly price × months,
        less the duration&apos;s discount.
      </p>
      {isSuperAdmin && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setPeriodEditing("new")}>
          New duration
        </Button>
      )}
      <Table<BillingPeriodDto>
        className="mt-4"
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={periods}
        columns={[
          { title: "Duration", dataIndex: "months", render: (m: number) => durationLabel(m) },
          { title: "Discount", dataIndex: "discountPercent", render: (v: number) => (Number(v) ? `${Number(v)}%` : "—") },
          { title: "Status", dataIndex: "isActive", render: (v: boolean) => (v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>) },
          {
            key: "actions",
            render: (_, p) =>
              isSuperAdmin ? (
                <Space size={2}>
                  <Tooltip title="Edit">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setPeriodEditing(p)} />
                  </Tooltip>
                  <Popconfirm
                    title={`Delete the ${durationLabel(p.months)} option?`}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => deleteBillingPeriod(p.id).then(refreshPeriods).catch(fail)}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ) : null,
          },
        ]}
      />
    </>
  );

  const companiesTab = (
    <Table<Company>
      rowKey="id"
      size="small"
      pagination={{ pageSize: 50, hideOnSinglePage: true }}
      dataSource={companies}
      columns={[
        { title: "Company", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
        {
          title: "Plan",
          key: "plan",
          render: (_, c) =>
            c.subscriptionPlan && c.subscriptionEndsAt && c.subscriptionEndsAt >= today ? (
              <Tag color="blue">{c.subscriptionPlan.name}</Tag>
            ) : (
              <Tag>{plans.find((p) => p.isFree)?.name ?? "Free"}</Tag>
            ),
        },
        {
          title: "Ends",
          dataIndex: "subscriptionEndsAt",
          render: (v: string | null) => v ?? "—",
          sorter: (a, b) => (a.subscriptionEndsAt ?? "").localeCompare(b.subscriptionEndsAt ?? ""),
        },
        {
          key: "actions",
          render: (_, c) =>
            isSuperAdmin ? (
              <Button
                size="small"
                onClick={() => {
                  setAssigning(c);
                  setAssignPlanId(c.subscriptionPlan?.id ?? null);
                  setAssignEndsAt(c.subscriptionEndsAt);
                }}
              >
                Change plan
              </Button>
            ) : null,
        },
      ]}
    />
  );

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="mt-1 text-sm text-gray-500">
          Plans cap how many Account Holder, Stock Owner, 3PL and Staff accounts a company can have. Companies without an active paid plan
          are on the free plan.
        </p>
        {error && <Alert type="error" title={error} className="mt-4" showIcon closable onClose={() => setError(null)} />}

        <Tabs
          className="mt-4"
          items={[
            { key: "payments", label: `Payments${pendingCount ? ` (${pendingCount})` : ""}`, children: paymentsTab },
            { key: "plans", label: "Plans", children: plansTab },
            { key: "periods", label: "Durations & discounts", children: periodsTab },
            { key: "companies", label: "Companies", children: companiesTab },
          ]}
        />

        <Modal
          open={planEditing !== null}
          title={planEditing === "new" ? "New plan" : `Edit ${planEditing?.name ?? ""}`}
          okText="Save"
          confirmLoading={saving}
          onOk={savePlan}
          onCancel={() => setPlanEditing(null)}
          destroyOnHidden
        >
          <Form form={planForm} layout="vertical" preserve={false} initialValues={planInitialValues}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input />
            </Form.Item>
            <Form.Item
              name="pricePerMonth"
              label="Price per month"
              rules={[{ required: true }]}
              tooltip={editingFreePlan ? "The free plan always costs 0" : undefined}
            >
              <InputNumber min={0} precision={2} prefix="Rs" className="w-full" disabled={editingFreePlan} />
            </Form.Item>
            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item name="maxAccountHolders" label="Account Holders" rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} className="w-full" />
              </Form.Item>
              <Form.Item name="maxStockOwners" label="Stock Owners" rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} className="w-full" />
              </Form.Item>
              <Form.Item name="maxThreePls" label="3PLs" rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} className="w-full" />
              </Form.Item>
              <Form.Item name="maxStaff" label="Staff" rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} className="w-full" />
              </Form.Item>
              <Form.Item name="sortOrder" label="Display order" tooltip="Lower numbers are shown first">
                <InputNumber precision={0} className="w-full" />
              </Form.Item>
              <Form.Item
                name="isActive"
                label="Available to buy"
                valuePropName="checked"
                tooltip="Inactive plans are hidden from companies; anyone already on one keeps it until it ends"
              >
                <Switch disabled={editingFreePlan} />
              </Form.Item>
            </div>
            <p className="mb-0 text-xs text-gray-500">
              Lowering a limit never deactivates anyone — companies over it just can&apos;t add more accounts of that type.
            </p>
          </Form>
        </Modal>

        <Modal
          open={periodEditing !== null}
          title={periodEditing === "new" ? "New duration" : "Edit duration"}
          okText="Save"
          confirmLoading={saving}
          onOk={savePeriod}
          onCancel={() => setPeriodEditing(null)}
          destroyOnHidden
        >
          <Form form={periodForm} layout="vertical" preserve={false} initialValues={periodInitialValues}>
            <Form.Item name="months" label="Months" rules={[{ required: true }]}>
              <InputNumber min={1} max={60} precision={0} className="w-full" />
            </Form.Item>
            <Form.Item name="discountPercent" label="Discount" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} precision={2} suffix="%" className="w-full" />
            </Form.Item>
            <Form.Item name="isActive" label="Offered to companies" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          open={assigning !== null}
          title={`Change plan — ${assigning?.name ?? ""}`}
          okText="Save"
          confirmLoading={saving}
          okButtonProps={{ disabled: !assignPlanId || (!assignPlan?.isFree && !assignEndsAt) }}
          onOk={saveAssignment}
          onCancel={() => setAssigning(null)}
          destroyOnHidden
        >
          <p className="text-sm text-gray-500">
            Puts the company on a plan without a payment (e.g. an offline deal). Moving it to the free plan doesn&apos;t deactivate
            anyone; they just can&apos;t add accounts past the free limits.
          </p>
          <Form layout="vertical">
            <Form.Item label="Plan">
              <Select
                showSearch={searchable}
                value={assignPlanId ?? undefined}
                onChange={setAssignPlanId}
                options={plans.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            {assignPlan && !assignPlan.isFree && (
              <Form.Item label="Active until (inclusive)">
                <DateField value={assignEndsAt ?? ""} onChange={(v) => setAssignEndsAt(v || null)} />
              </Form.Item>
            )}
          </Form>
        </Modal>
      </main>
    </>
  );
}
