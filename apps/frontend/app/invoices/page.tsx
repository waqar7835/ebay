"use client";

import type { InvoiceDto } from "@ebay-order-management/shared";
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Popconfirm, Table, Tag, Tooltip, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag from "@/components/RoleTag";
import { DeleteAction } from "@/components/RowActions";
import { deleteInvoice, downloadInvoicePdf, getStoredUser, getToken, listInvoices, markInvoicePaid } from "@/lib/api";
import { userLabel } from "@/lib/selectOptions";
import { invoiceMoney } from "@/lib/currency";
import { saveBlob } from "@/lib/download";

const STATUS_COLOR: Record<string, string> = { UNPAID: "orange", PAID: "green", VOID: "red" };

export default function InvoicesPage() {
  const router = useRouter();
  const user = getStoredUser();
  const isAdmin = user?.roles.includes("ADMIN" as never) ?? false;
  // Only the company Admin (and Staff allowed to) create/delete/pay invoices; financial Staff can view them all.
  const canManage = isAdmin || !!user?.staffPermissions?.canGenerateInvoices;
  const canSeeAll = canManage || !!user?.staffPermissions?.canViewFinancials;

  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoices"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleDownload(invoice: InvoiceDto) {
    setError(null);
    try {
      saveBlob(await downloadInvoicePdf(invoice.id), `${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download invoice");
    }
  }

  async function handleDelete(invoice: InvoiceDto) {
    setError(null);
    setMessage(null);
    try {
      const { voided } = await deleteInvoice(invoice.id);
      setMessage(
        voided
          ? `${invoice.invoiceNumber} was voided — its orders are open again.`
          : `${invoice.invoiceNumber} was deleted — its orders are open again.`,
      );
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    }
  }

  async function handleMarkPaid(invoice: InvoiceDto) {
    setError(null);
    try {
      await markInvoicePaid(invoice.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark invoice paid");
    }
  }

  const columns: TableColumnsType<InvoiceDto> = [
    { title: "Invoice #", dataIndex: "invoiceNumber", render: (v: string) => <span className="font-medium">{v}</span> },
    ...(canSeeAll
      ? [{ title: "User", key: "user", render: (_: unknown, inv: InvoiceDto) => userLabel(inv.user) }]
      : []),
    { title: "Role", dataIndex: "role", render: (r: string) => <RoleTag role={r} /> },
    {
      title: "Orders",
      key: "orders",
      render: (_, inv) => inv.lineItems.filter((l) => l.kind === "ORDER").length,
    },
    {
      title: "Total",
      key: "total",
      render: (_, inv) => (
        <div>
          <div className="font-medium">{invoiceMoney(inv.totalAmount, inv.currency)}</div>
          <div className="text-xs text-slate-500">
            {/* Account Holders hold the eBay money, so their invoice is what they owe the company. */}
            {inv.role === "ACCOUNT_HOLDER"
              ? canSeeAll
                ? "owed to company"
                : "you owe"
              : canSeeAll
                ? "payable to user"
                : "payable to you"}
          </div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: "Issued", dataIndex: "generatedAt", render: (v: string) => new Date(v).toLocaleDateString() },
    {
      key: "actions",
      render: (_, inv) => (
        <div className="flex items-center justify-end gap-1">
          <Tooltip title="Download PDF">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(inv)}
              aria-label="Download PDF"
            />
          </Tooltip>
          {canManage && inv.status === "UNPAID" && (
            <Popconfirm title="Mark this invoice as paid?" onConfirm={() => handleMarkPaid(inv)}>
              <Button size="small">Mark paid</Button>
            </Popconfirm>
          )}
          {canManage && inv.status !== "VOID" && (
            <DeleteAction
              title={inv.status === "PAID" ? "Void" : "Delete"}
              confirmTitle={
                inv.status === "PAID"
                  ? "Void this paid invoice? It stays on record as VOID and its orders become open again."
                  : "Delete this invoice? Its orders become open again."
              }
              onConfirm={() => handleDelete(inv)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-2xl font-semibold">{canSeeAll ? "Invoices" : "My Invoices"}</h1>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/invoices/new")}>
              Create invoice
            </Button>
          )}
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}
        {message && (
          <Alert type="success" title={message} className="mt-4" showIcon closable onClose={() => setMessage(null)} />
        )}

        <Table<InvoiceDto>
          className="mt-6"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={invoices}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: "No invoices yet." }}
        />
      </main>
    </>
  );
}
