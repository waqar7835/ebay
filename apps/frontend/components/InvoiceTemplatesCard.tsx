"use client";

import {
  MAX_CUSTOM_INVOICE_TEMPLATES,
  type InvoiceTemplateDto,
  type InvoiceTemplatesDto,
} from "@ebay-order-management/shared";
import { FileTextOutlined, PlusOutlined, StarOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Table, Tag, Tooltip, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditAction, DeleteAction, ResetAction } from "@/components/RowActions";
import InvoiceTemplateSwatches, { LAYOUT_LABELS } from "@/components/InvoiceTemplateSwatches";
import { deleteInvoiceTemplate, listInvoiceTemplates, mediaUrl, resetInvoiceTemplate, setDefaultInvoiceTemplate } from "@/lib/api";

/**
 * Profile page (company Admin only): the five predefined invoice templates plus up to five custom
 * ones. Pick the default the invoice wizard preselects. Predefined ones can be edited (colors, logo,
 * watermark) and reset to the original; a new template starts from any existing one.
 */
export default function InvoiceTemplatesCard() {
  const router = useRouter();
  const [data, setData] = useState<InvoiceTemplatesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    listInvoiceTemplates()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invoice templates"));
  }

  useEffect(load, []);

  async function run(id: string, action: () => Promise<unknown>) {
    setError(null);
    setBusyId(id);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  const customCount = data?.templates.filter((t) => !t.predefined).length ?? 0;
  const full = customCount >= MAX_CUSTOM_INVOICE_TEMPLATES;
  const fullReason = `You can save up to ${MAX_CUSTOM_INVOICE_TEMPLATES} custom templates — delete one to make room`;

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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1 font-medium">
              {t.name}
              {data?.defaultTemplateId === t.id && (
                <Tag color="gold" icon={<StarOutlined />} className="ml-1">
                  Default
                </Tag>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {[
                `${LAYOUT_LABELS[t.layout].name} layout`,
                t.predefined ? (t.customized ? "Predefined, edited" : "Predefined") : "Custom",
                t.logoUrl ? "own logo" : null,
                t.watermark?.enabled ? "watermark" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      ),
    },
    { title: "Colors", key: "colors", render: (_, t) => <InvoiceTemplateSwatches colors={t.colors} /> },
    {
      key: "actions",
      align: "right",
      render: (_, t) => (
        <div className="flex items-center justify-end gap-1">
          {data?.defaultTemplateId !== t.id && (
            <Button size="small" loading={busyId === t.id} onClick={() => run(t.id, () => setDefaultInvoiceTemplate(t.id))}>
              Set as default
            </Button>
          )}
          <EditAction onClick={() => router.push(`/profile/invoice-templates/${t.id}/edit`)} />
          {t.predefined ? (
            t.customized && (
              <ResetAction
                title="Reset to original"
                confirmTitle={`Reset "${t.name}" to its original colors, logo and no watermark? Invoices already issued keep their look.`}
                onConfirm={() => run(t.id, () => resetInvoiceTemplate(t.id))}
              />
            )
          ) : (
            <>
              <DeleteAction
                confirmTitle={`Delete "${t.name}"? Invoices already issued with it keep their look.`}
                onConfirm={() => run(t.id, () => deleteInvoiceTemplate(t.id))}
              />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card
      title={
        <span>
          <FileTextOutlined className="mr-2 text-slate-400" />
          Invoice templates
        </span>
      }
      extra={
        <Tooltip title={full ? fullReason : undefined}>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            disabled={full || !data}
            onClick={() => router.push(`/profile/invoice-templates/new?from=${data?.defaultTemplateId ?? ""}`)}
          >
            New template
          </Button>
        </Tooltip>
      }
    >
      <p className="mb-4 mt-0 text-sm text-slate-500">
        The style of your invoice PDFs. Whoever creates an invoice can pick any of these; the default is preselected.
        Edit a predefined template to change its colors, logo or watermark, or start a new one from any template.
        Custom templates: {customCount} of {MAX_CUSTOM_INVOICE_TEMPLATES}.
      </p>
      {error && <Alert type="error" title={error} className="mb-4" showIcon closable onClose={() => setError(null)} />}
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
