"use client";

import type { InvoiceDto } from "@ebay-order-management/shared";
import { DownloadOutlined } from "@ant-design/icons";
import { Alert, Button, Table, Tag, Tooltip, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag from "@/components/RoleTag";
import { downloadInvoicePdf, getToken, listInvoices } from "@/lib/api";
import { userLabel } from "@/lib/selectOptions";
import { invoiceMoney } from "@/lib/currency";

const STATUS_COLOR: Record<string, string> = { UNPAID: "orange", PAID: "green", VOID: "red" };

/**
 * Read-only oversight of the selected company's invoices. Creating, deleting and marking them paid
 * is done by the company's own Admin (or Staff allowed to) in the partner portal.
 */
export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleDownload(invoice: InvoiceDto) {
    setError(null);
    try {
      const url = URL.createObjectURL(await downloadInvoicePdf(invoice.id));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download invoice");
    }
  }

  const columns: TableColumnsType<InvoiceDto> = [
    { title: "Invoice #", dataIndex: "invoiceNumber", render: (v: string) => <span className="font-medium">{v}</span> },
    { title: "User", key: "user", render: (_, inv) => userLabel(inv.user) },
    { title: "Role", dataIndex: "role", render: (r: string) => <RoleTag role={r} /> },
    { title: "Orders", key: "orders", render: (_, inv) => inv.lineItems.filter((l) => l.kind === "ORDER").length },
    {
      title: "Total",
      key: "total",
      render: (_, inv) => (
        <div>
          <div className="font-medium">{invoiceMoney(inv.totalAmount, inv.currency)}</div>
          <div className="text-xs text-slate-500">
            {inv.role === "ACCOUNT_HOLDER" ? "owed to company" : "payable to user"}
          </div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: "Issued", dataIndex: "generatedAt", render: (v: string) => new Date(v).toLocaleDateString() },
    {
      key: "actions",
      render: (_, inv) => (
        <Tooltip title="Download PDF">
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(inv)}
            aria-label="Download PDF"
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="text-sm text-slate-500">
          Invoices are created by each company&apos;s Admin in the partner portal.
        </p>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

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
