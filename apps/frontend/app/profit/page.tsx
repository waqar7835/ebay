"use client";

import type {
  ExpenseCategoryDto,
  ExpenseDto,
  ProfitCycleDto,
  ProfitCycleSummaryDto,
  ProfitMiscLineDto,
  ProfitOrderLineDto,
  ProfitOverviewDto,
  ProfitRefundLineDto,
  ProfitSourceGroupDto,
  ProfitSplitMemberDto,
  ProfitSplitSettingsDto,
} from "@ebay-order-management/shared";
import {
  DownOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  PlusOutlined,
  SettingOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import ExpenseModal from "@/components/ExpenseModal";
import ExpenseCategoriesModal from "@/components/ExpenseCategoriesModal";
import ProfitSplitModal from "@/components/ProfitSplitModal";
import ProfitShareTable, { SignedPkr } from "@/components/ProfitShareTable";
import { DeleteAction, EditAction } from "@/components/RowActions";
import {
  deleteExpense,
  deleteProfitStatement,
  downloadProfitCyclePdf,
  generateProfitStatement,
  getProfitCycle,
  getProfitOverview,
  getProfitSplit,
  getStoredUser,
  getToken,
  listExpenseCategories,
  listExpenses,
  localDateOnly,
} from "@/lib/api";
import { pkr } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/date";
import { saveBlob } from "@/lib/download";

const STATUS_TAG: Record<ProfitCycleSummaryDto["status"], { label: string; color: string }> = {
  GENERATED: { label: "Statement generated", color: "green" },
  OPEN: { label: "Ready to generate", color: "orange" },
  CURRENT: { label: "Current cycle", color: "blue" },
};

function cycleLabel(c: Pick<ProfitCycleSummaryDto, "cycleStart" | "cycleEnd">) {
  return `${formatDate(c.cycleStart)} – ${formatDate(c.cycleEnd)}`;
}

export default function ProfitPage() {
  return (
    <Suspense>
      <ProfitPageBody />
    </Suspense>
  );
}

/**
 * Profit & Expenses (2026-11-05) — company Admin and partners only. Per billing cycle: where the company's profit came
 * from (orders by Account Holder / Stock Owner / 3PL, refunds, invoice extra lines), how it splits between the company,
 * the Admin and partners, their expenses and net in hand, and the cycle's profit statement (company + per person PDFs).
 */
function ProfitPageBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = getStoredUser();
  const isAdmin = me?.roles.includes("ADMIN" as never) ?? false;

  const [overview, setOverview] = useState<ProfitOverviewDto | null>(null);
  const [settings, setSettings] = useState<ProfitSplitSettingsDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cycle, setCycle] = useState<ProfitCycleDto | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [loadingCycle, setLoadingCycle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [splitOpen, setSplitOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [expenseModal, setExpenseModal] = useState<{ open: boolean; expense: ExpenseDto | null }>({ open: false, expense: null });

  const loadOverview = useCallback(async (keep?: string | null) => {
    const [next, split, cats] = await Promise.all([getProfitOverview(), getProfitSplit(), listExpenseCategories()]);
    setOverview(next);
    setSettings(split);
    setCategories(cats);
    const wanted = keep ?? searchParams.get("cycle");
    const pick = next.cycles.find((c) => c.cycleStart === wanted) ?? next.cycles[0];
    setSelected(pick?.cycleStart ?? null);
    if (!pick) setCycle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCycle = useCallback(async (start: string) => {
    setLoadingCycle(true);
    try {
      const [dto, list] = await Promise.all([getProfitCycle(start), listExpenses()]);
      setCycle(dto);
      setExpenses(list.filter((e) => e.expenseDate >= dto.cycleStart && e.expenseDate <= dto.cycleEnd));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this cycle");
    } finally {
      setLoadingCycle(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    loadOverview().catch((err) => setError(err instanceof Error ? err.message : "Failed to load profit & expenses"));
  }, [router, loadOverview]);

  useEffect(() => {
    if (!selected) return;
    router.replace(`/profit?cycle=${selected}`, { scroll: false });
    loadCycle(selected);
  }, [selected, loadCycle, router]);

  async function refreshAll() {
    await loadOverview(selected);
    if (selected) await loadCycle(selected);
  }

  async function handleGenerate() {
    if (!cycle) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const dto = await generateProfitStatement(cycle.cycleStart);
      setMessage(`Profit statement ${dto.statementNumber} generated — this cycle is now frozen.`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the statement");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStatement() {
    if (!cycle?.statementId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteProfitStatement(cycle.statementId);
      setMessage(`Statement ${cycle.statementNumber} deleted — the cycle is open again.`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the statement");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(userId?: string) {
    if (!cycle) return;
    setError(null);
    try {
      const person = userId ? cycle.shares.find((s) => s.userId === userId)?.name : null;
      const base = cycle.statementNumber ?? `profit-statement-${cycle.cycleStart}-draft`;
      saveBlob(await downloadProfitCyclePdf(cycle.cycleStart, userId), `${base}${person ? `-${person}` : ""}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download the PDF");
    }
  }

  async function handleDeleteExpense(expense: ExpenseDto) {
    setError(null);
    try {
      await deleteExpense(expense.id);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the expense");
    }
  }

  // Who the requester may charge an expense to: the Admin anyone; a partner only themselves (plus the company).
  const chargeableMembers = useMemo<ProfitSplitMemberDto[]>(() => {
    if (!settings) return [];
    const all = [settings.admin, ...settings.partners].filter((m) => m.userId);
    return isAdmin ? all : all.filter((m) => m.userId === me?.id);
  }, [settings, isAdmin, me?.id]);

  const frozen = cycle?.status === "GENERATED";
  const canEditExpense = (e: ExpenseDto) => !frozen && !e.profitStatementId && (isAdmin || e.createdByUserId === me?.id);
  const defaultExpenseDate = cycle
    ? localDateOnly() >= cycle.cycleStart && localDateOnly() <= cycle.cycleEnd
      ? localDateOnly()
      : cycle.cycleEnd
    : undefined;

  const expenseColumns: TableColumnsType<ExpenseDto> = [
    { title: "Date", dataIndex: "expenseDate", width: 120, render: (v: string) => formatDate(v) },
    {
      title: "Expense",
      key: "title",
      render: (_, e) => (
        <div>
          <div className="font-medium">{e.title}</div>
          {e.notes && <div className="whitespace-pre-wrap text-xs text-slate-500">{e.notes}</div>}
        </div>
      ),
    },
    { title: "Category", dataIndex: "categoryName", render: (v: string | null) => (v ? <Tag>{v}</Tag> : <span className="text-slate-400">—</span>) },
    {
      title: "Charged to",
      key: "chargedTo",
      render: (_, e) => <Tag color={e.chargedTo === "COMPANY" ? "blue" : "green"}>{e.chargedToName}</Tag>,
    },
    { title: "Added by", dataIndex: "createdByName", render: (v: string) => <span className="text-slate-600">{v}</span> },
    { title: "Amount", dataIndex: "amount", align: "right", render: (v: number) => <SignedPkr value={-v} /> },
    {
      key: "actions",
      width: 80,
      render: (_, e) =>
        canEditExpense(e) ? (
          <div className="flex items-center justify-end gap-1">
            <EditAction onClick={() => setExpenseModal({ open: true, expense: e })} />
            <DeleteAction confirmTitle="Delete this expense?" onConfirm={() => handleDeleteExpense(e)} />
          </div>
        ) : null,
    },
  ];

  const people = cycle?.shares.filter((s) => s.userId) ?? [];
  const companyRow = cycle?.shares.find((s) => s.kind === "COMPANY");

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold">Profit &amp; Expenses</h1>
            <p className="m-0 mt-1 text-sm text-slate-500">
              Company profit per billing cycle, the split, everyone&apos;s expenses and net in hand. All amounts in PKR.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {overview && overview.cycles.length > 0 && (
              <Select
                className="min-w-72"
                value={selected ?? undefined}
                onChange={setSelected}
                options={overview.cycles.map((c) => ({
                  value: c.cycleStart,
                  label: (
                    <span className="flex items-center justify-between gap-3">
                      <span>{cycleLabel(c)}</span>
                      <Tag color={STATUS_TAG[c.status].color} className="m-0">
                        {c.statementNumber ?? STATUS_TAG[c.status].label}
                      </Tag>
                    </span>
                  ),
                }))}
                aria-label="Billing cycle"
              />
            )}
            {isAdmin && (
              <Button icon={<SettingOutlined />} onClick={() => setSplitOpen(true)} disabled={!settings}>
                Split settings
              </Button>
            )}
          </div>
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon closable onClose={() => setError(null)} />}
        {message && <Alert type="success" title={message} className="mt-4" showIcon closable onClose={() => setMessage(null)} />}

        {!overview ? (
          <Skeleton active className="mt-6" />
        ) : overview.needsSetup ? (
          <Card className="mt-6">
            <Empty
              description={
                isAdmin ? (
                  <span>
                    Set the profit split and the company&apos;s first cycle and opening balance to start tracking profit.
                  </span>
                ) : (
                  <span>The company Admin hasn&apos;t set up the profit split yet.</span>
                )
              }
            >
              {isAdmin && (
                <Button type="primary" icon={<SettingOutlined />} onClick={() => setSplitOpen(true)}>
                  Set up profit split
                </Button>
              )}
            </Empty>
          </Card>
        ) : !cycle ? (
          overview.cycles.length === 0 ? (
            <Alert className="mt-6" type="info" showIcon title="The first profit cycle hasn't started yet." />
          ) : (
            <Skeleton active className="mt-6" />
          )
        ) : (
          <div className={loadingCycle ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
            <CycleBanner
              cycle={cycle}
              busy={busy}
              onGenerate={handleGenerate}
              onDelete={handleDeleteStatement}
              onDownload={handleDownload}
              people={people.map((p) => ({ userId: p.userId!, name: p.name }))}
            />

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card size="small" className="kpi-hero">
                <Statistic title="Total profit" value={cycle.totals.profit} precision={2} prefix="Rs" />
              </Card>
              <Card size="small" className="kpi-mint">
                <Statistic
                  title="Company net in hand"
                  value={cycle.companyClosingBalance}
                  precision={2}
                  prefix="Rs"
                  styles={cycle.companyClosingBalance < 0 ? { content: { color: "#dc2626" } } : undefined}
                />
              </Card>
              <Card size="small" className="kpi-sky">
                <Statistic title="Expenses" value={cycle.totals.expenses} precision={2} prefix="Rs" />
              </Card>
              <Card size="small" className="kpi-lavender">
                {cycle.estimate ? (
                  <Tooltip title="Approx. company profit of every order that isn't on an Account Holder invoice yet">
                    <Statistic
                      title={`Not invoiced yet (${cycle.estimate.orderCount} orders)`}
                      value={cycle.estimate.profit}
                      precision={2}
                      prefix="≈ Rs"
                    />
                  </Tooltip>
                ) : (
                  <Statistic title="Orders counted" value={cycle.orders.length} />
                )}
              </Card>
            </div>

            <Card size="small" className="mt-4" title={<span className="text-sm font-medium">Profit split &amp; net in hand</span>}>
              <ProfitShareTable shares={cycle.shares} />
              {companyRow && (
                <p className="m-0 mt-2 text-xs text-slate-500">
                  Admin and partners: profit share − their expenses. Company: its share − company expenses + what it had at
                  the end of the previous cycle.
                </p>
              )}
            </Card>

            <SourcesCard cycle={cycle} />

            <Card
              size="small"
              className="mt-4"
              title={
                <span className="text-sm font-medium">
                  Expenses <span className="font-normal text-slate-500">· {pkr(cycle.totals.expenses)}</span>
                </span>
              }
              extra={
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button size="small" icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)}>
                      Categories
                    </Button>
                  )}
                  <Tooltip title={frozen ? "This cycle has a statement — delete it to add expenses" : undefined}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlusOutlined />}
                      disabled={frozen}
                      onClick={() => setExpenseModal({ open: true, expense: null })}
                    >
                      Add expense
                    </Button>
                  </Tooltip>
                </div>
              }
            >
              <Table<ExpenseDto>
                rowKey="id"
                size="small"
                columns={expenseColumns}
                dataSource={expenses}
                pagination={{ pageSize: 50, hideOnSinglePage: true }}
                locale={{ emptyText: "No expenses in this cycle." }}
              />
            </Card>
          </div>
        )}
      </main>

      <ProfitSplitModal
        open={splitOpen}
        settings={settings}
        locked={!!overview?.cycles.some((c) => c.status === "GENERATED")}
        onClose={() => setSplitOpen(false)}
        onSaved={async () => {
          setSplitOpen(false);
          setMessage("Profit split saved.");
          await refreshAll();
        }}
      />
      <ExpenseModal
        open={expenseModal.open}
        expense={expenseModal.expense}
        members={chargeableMembers}
        categories={categories}
        defaultDate={defaultExpenseDate}
        onClose={() => setExpenseModal({ open: false, expense: null })}
        onSaved={async () => {
          setExpenseModal({ open: false, expense: null });
          await refreshAll();
        }}
      />
      <ExpenseCategoriesModal
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChange={setCategories}
      />
    </>
  );
}

/** The cycle's state and its statement actions: generate / delete, and the company or a person's PDF. */
function CycleBanner({
  cycle,
  busy,
  people,
  onGenerate,
  onDelete,
  onDownload,
}: {
  cycle: ProfitCycleDto;
  busy: boolean;
  people: { userId: string; name: string }[];
  onGenerate: () => void;
  onDelete: () => void;
  onDownload: (userId?: string) => void;
}) {
  const generated = cycle.status === "GENERATED";
  const draft = generated ? "" : " (draft)";
  const description = generated
    ? `Statement ${cycle.statementNumber} · generated ${formatDateTime(cycle.generatedAt)}${cycle.generatedByName ? ` by ${cycle.generatedByName}` : ""}. Figures and expenses for this cycle are frozen.`
    : cycle.status === "CURRENT"
      ? `This cycle runs until ${formatDate(cycle.cycleEnd)}. Figures are live: orders count once their Account Holder invoice is approved.`
      : "This cycle has ended. Generate its statement to freeze the figures and expenses.";

  return (
    <Alert
      className="mt-6"
      type={generated ? "success" : cycle.status === "OPEN" ? "warning" : "info"}
      showIcon
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{cycleLabel(cycle)}</span>
          <Tag color={STATUS_TAG[cycle.status].color} className="m-0">
            {STATUS_TAG[cycle.status].label}
          </Tag>
        </span>
      }
      description={description}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Space.Compact>
            <Button icon={<DownloadOutlined />} onClick={() => onDownload()}>
              Company PDF{draft}
            </Button>
            {people.length > 0 && (
              <Dropdown
                menu={{
                  items: people.map((p) => ({ key: p.userId, label: `${p.name}'s statement${draft}` })),
                  onClick: ({ key }) => onDownload(key),
                }}
              >
                <Button icon={<DownOutlined />} aria-label="Download a person's statement" />
              </Dropdown>
            )}
          </Space.Compact>
          {!generated && (
            <Tooltip title={cycle.generateBlockedReason ?? undefined}>
              <Popconfirm
                title="Generate this cycle's statement?"
                description="Its figures, split and expenses are frozen. Only the latest statement can be deleted later."
                okText="Generate"
                onConfirm={onGenerate}
                disabled={!cycle.canGenerate}
              >
                <Button type="primary" icon={<FileDoneOutlined />} loading={busy} disabled={!cycle.canGenerate}>
                  Generate statement
                </Button>
              </Popconfirm>
            </Tooltip>
          )}
          {generated && cycle.canDelete && (
            <Popconfirm
              title={`Delete statement ${cycle.statementNumber}?`}
              description="The cycle opens again so its expenses can change and it can be generated again."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
            >
              <Button danger loading={busy}>
                Delete statement
              </Button>
            </Popconfirm>
          )}
        </div>
      }
    />
  );
}

const groupColumns: TableColumnsType<ProfitSourceGroupDto> = [
  { title: "Name", dataIndex: "name", render: (v: string) => <span className="font-medium">{v}</span> },
  { title: "Orders", dataIndex: "orderCount", align: "right", width: 100 },
  { title: "Company profit", dataIndex: "amount", align: "right", width: 160, render: (v: number) => <SignedPkr value={v} /> },
];

function GroupTable({ groups, empty }: { groups: ProfitSourceGroupDto[]; empty: string }) {
  return (
    <Table<ProfitSourceGroupDto>
      rowKey={(g) => g.userId ?? "none"}
      size="small"
      pagination={false}
      columns={groupColumns}
      dataSource={groups}
      locale={{ emptyText: empty }}
      expandable={{
        expandedRowRender: (g) => (
          <div className="flex flex-wrap gap-2">
            {g.orders.map((o) => (
              <Tag key={o.orderId} className="m-0">
                {o.ebayOrderRef} · <SignedPkr value={o.amount} />
              </Tag>
            ))}
          </div>
        ),
      }}
    />
  );
}

function LateTag({ late }: { late: boolean }) {
  if (!late) return null;
  return (
    <Tooltip title="Approved in an earlier cycle but missed by its statement, so it's counted here">
      <Tag color="gold" className="ml-2">
        Late
      </Tag>
    </Tooltip>
  );
}

const orderColumns: TableColumnsType<ProfitOrderLineDto> = [
  {
    title: "Order #",
    key: "ref",
    render: (_, o) => (
      <span className="font-medium">
        {o.ebayOrderRef}
        <LateTag late={o.late} />
      </span>
    ),
  },
  { title: "AH invoice", dataIndex: "invoiceNumber", render: (v: string | null) => v ?? "—" },
  { title: "AH share", dataIndex: "accountHolderShare", align: "right", render: (v: number) => <SignedPkr value={v} /> },
  { title: "Markup", dataIndex: "productMarkup", align: "right", render: (v: number) => <SignedPkr value={v} /> },
  { title: "SO cut", dataIndex: "stockOwnerCut", align: "right", render: (v: number) => <SignedPkr value={v} /> },
  { title: "3PL markup", dataIndex: "threePlMarkup", align: "right", render: (v: number) => <SignedPkr value={v} /> },
  { title: "Total", dataIndex: "total", align: "right", render: (v: number) => <SignedPkr value={v} bold /> },
];

const refundColumns: TableColumnsType<ProfitRefundLineDto> = [
  {
    title: "Order #",
    key: "ref",
    render: (_, r) => (
      <span className="font-medium">
        {r.ebayOrderRef}
        <LateTag late={r.late} />
      </span>
    ),
  },
  { title: "Refund", dataIndex: "note" },
  { title: "AH invoice", dataIndex: "invoiceNumber", render: (v: string | null) => v ?? "—" },
  {
    title: <Tooltip title="What the company credits the Account Holder back">AH credited</Tooltip>,
    dataIndex: "accountHolderCredit",
    align: "right",
    render: (v: number) => <SignedPkr value={-v} />,
  },
  {
    title: <Tooltip title="What the Stock Owner gives back (or is never paid)">SO returns</Tooltip>,
    dataIndex: "stockOwnerReturn",
    align: "right",
    render: (v: number) => <SignedPkr value={v} />,
  },
  {
    title: <Tooltip title="What a dropship 3PL pays back (or is never paid)">3PL pays back</Tooltip>,
    dataIndex: "threePlPayback",
    align: "right",
    render: (v: number) => <SignedPkr value={v} />,
  },
  { title: "Effect on profit", dataIndex: "net", align: "right", render: (v: number) => <SignedPkr value={v} bold /> },
];

const ROLE_LABEL: Record<string, string> = { ACCOUNT_HOLDER: "Account Holder", STOCK_OWNER: "Stock Owner", THREE_PL: "3PL" };

const miscColumns: TableColumnsType<ProfitMiscLineDto> = [
  {
    title: "Invoice #",
    key: "inv",
    render: (_, m) => (
      <span className="font-medium">
        {m.invoiceNumber}
        <LateTag late={m.late} />
      </span>
    ),
  },
  { title: "Party", key: "party", render: (_, m) => `${m.partyName} (${ROLE_LABEL[m.role] ?? m.role})` },
  { title: "Line", dataIndex: "title" },
  {
    title: "As invoiced",
    key: "orig",
    align: "right",
    render: (_, m) => `${m.amountOriginal.toFixed(2)} ${m.currency}`,
  },
  {
    title: <Tooltip title="Account Holder invoices bring money in; Stock Owner / 3PL invoices pay it out">Effect on profit</Tooltip>,
    dataIndex: "amount",
    align: "right",
    render: (v: number) => <SignedPkr value={v} bold />,
  },
];

/** Where the cycle's profit came from, one tab per source. */
function SourcesCard({ cycle }: { cycle: ProfitCycleDto }) {
  const t = cycle.totals;
  const tabLabel = (label: string, amount: number) => (
    <span>
      {label} <span className={`text-xs ${amount < 0 ? "text-red-600" : "text-slate-500"}`}>{pkr(amount)}</span>
    </span>
  );
  return (
    <Card
      size="small"
      className="mt-4"
      title={<span className="text-sm font-medium">Where the profit came from</span>}
      extra={
        <span className="text-xs text-slate-500">
          Orders {pkr(t.orders)} + refunds <span className={t.refunds < 0 ? "text-red-600" : ""}>{pkr(t.refunds)}</span> + extra
          lines {pkr(t.misc)} = <span className="font-semibold text-slate-800">{pkr(t.profit)}</span>
        </span>
      }
    >
      <Tabs
        size="small"
        items={[
          {
            key: "ah",
            label: tabLabel("Account Holders", t.accountHolderShare),
            children: <GroupTable groups={cycle.byAccountHolder} empty="No Account Holder profit in this cycle." />,
          },
          {
            key: "so",
            label: tabLabel("Stock", t.productMarkup + t.stockOwnerCut),
            children: (
              <>
                <p className="m-0 mb-2 text-xs text-slate-500">Product markup + profit-share cut, per Stock Owner.</p>
                <GroupTable groups={cycle.byStockOwner} empty="No stock profit in this cycle." />
              </>
            ),
          },
          {
            key: "tpl",
            label: tabLabel("3PL", t.threePlMarkup),
            children: <GroupTable groups={cycle.byThreePl} empty="No 3PL markup in this cycle." />,
          },
          {
            key: "orders",
            label: `Orders (${cycle.orders.length})`,
            children: (
              <Table<ProfitOrderLineDto>
                rowKey="orderId"
                size="small"
                columns={orderColumns}
                dataSource={cycle.orders}
                pagination={{ pageSize: 50, hideOnSinglePage: true }}
                scroll={{ x: true }}
                locale={{ emptyText: "No orders were invoiced to Account Holders in this cycle." }}
              />
            ),
          },
          {
            key: "refunds",
            label: tabLabel(`Refunds (${cycle.refunds.length})`, t.refunds),
            children: (
              <Table<ProfitRefundLineDto>
                rowKey="orderId"
                size="small"
                columns={refundColumns}
                dataSource={cycle.refunds}
                pagination={false}
                scroll={{ x: true }}
                locale={{ emptyText: "No refunds settled in this cycle." }}
              />
            ),
          },
          {
            key: "misc",
            label: tabLabel(`Extra lines (${cycle.misc.length})`, t.misc),
            children: (
              <Table<ProfitMiscLineDto>
                rowKey="lineId"
                size="small"
                columns={miscColumns}
                dataSource={cycle.misc}
                pagination={false}
                scroll={{ x: true }}
                locale={{ emptyText: "No extra invoice lines in this cycle." }}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
