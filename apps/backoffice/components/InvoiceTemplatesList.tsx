"use client";

import { INVOICE_TEMPLATE_COLOR_KEYS, InvoiceLayout, type InvoiceTemplateDto, type InvoiceTemplatesDto } from "@ebay-order-management/shared";
import { FileTextOutlined, StarOutlined } from "@ant-design/icons";
import { Alert, Card, Table, Tag, Tooltip, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { listInvoiceTemplates, mediaUrl } from "@/lib/api";

const LAYOUT_NAMES: Record<InvoiceLayout, string> = {
  [InvoiceLayout.CLASSIC]: "Classic",
  [InvoiceLayout.SPLIT]: "Split Header",
  [InvoiceLayout.SIDEBAR]: "Sidebar",
  [InvoiceLayout.CARDS]: "Soft Cards",
  [InvoiceLayout.BOLD]: "Bold",
};

const COLOR_NAMES: Record<string, string> = {
  background: "Page background",
  accent: "Heading background",
  headingText: "Heading text",
  text: "Body text",
  border: "Borders",
};

/**
 * Read-only look at the selected company's invoice templates (predefined + custom, and the default).
 * The company Admin manages them from the portal's Profile page.
 */
export default function InvoiceTemplatesList() {
  const [data, setData] = useState<InvoiceTemplatesDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInvoiceTemplates()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoice templates"));
  }, []);

  const columns: TableColumnsType<InvoiceTemplateDto> = [
    {
      title: "Template",
      key: "name",
      render: (_, t) => (
        <div className="flex items-center gap-3">
          {t.logoUrl ? (
            <img src={mediaUrl(t.logoUrl)} alt="" className="h-8 w-8 rounded border object-contain" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded border text-slate-400">
              <FileTextOutlined />
            </span>
          )}
          <span className="font-medium">{t.name}</span>
          {data?.defaultTemplateId === t.id && (
            <Tag color="gold" icon={<StarOutlined />}>
              Default
            </Tag>
          )}
        </div>
      ),
    },
    { title: "Layout", dataIndex: "layout", render: (l: InvoiceLayout) => LAYOUT_NAMES[l] },
    {
      title: "Type",
      key: "type",
      render: (_, t) => (t.predefined ? (t.customized ? "Predefined, edited" : "Predefined") : "Custom"),
    },
    {
      title: "Watermark",
      key: "watermark",
      render: (_, t) => (t.watermark?.enabled ? <span title={t.watermark.text}>{t.watermark.text}</span> : "—"),
    },
    {
      title: "Colors",
      key: "colors",
      render: (_, t) => (
        <span className="inline-flex items-center gap-1">
          {INVOICE_TEMPLATE_COLOR_KEYS.map((key) => (
            <Tooltip key={key} title={`${COLOR_NAMES[key]}: ${t.colors[key]}`}>
              <span className="inline-block h-4 w-4 rounded-full border border-slate-300" style={{ background: t.colors[key] }} />
            </Tooltip>
          ))}
        </span>
      ),
    },
  ];

  return (
    <Card title="Invoice templates" className="mt-8">
      <p className="mb-4 mt-0 text-sm text-slate-500">
        Managed by the company&apos;s Admin in the partner portal (Profile page).
      </p>
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      <Table<InvoiceTemplateDto>
        rowKey="id"
        size="small"
        loading={!data && !error}
        columns={columns}
        dataSource={data?.templates ?? []}
        pagination={false}
      />
    </Card>
  );
}
