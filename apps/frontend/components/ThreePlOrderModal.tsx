"use client";

import type { Currency, OrderDto, ProductDto } from "@ebay-order-management/shared";
import { Alert, Descriptions, Form, Input, InputNumber, Modal, Switch, Tag } from "antd";
import { useEffect, useState } from "react";
import ProductThumb from "@/components/ProductThumb";
import { isInvoiced } from "@/components/InvoiceStatusTags";
import { updateThreePlOrder } from "@/lib/api";
import { currencySymbol } from "@/lib/currency";
import { formatDate } from "@/lib/date";

interface FormValues {
  buyTotals: Record<string, number | null>;
  supplierUrl: string;
  trackingNumber: string;
  markShipped: boolean;
}

/**
 * Edit popup for a DROPSHIP 3PL on the orders list. Shows the order as it appears in their row (read-only) plus the only
 * fields they may change: each line's buy total (in their currency, locked once invoiced), the supplier URL, the
 * tracking number (optional — they can come back and add it after shipping) and PROCESSING -> SHIPPED.
 */
export default function ThreePlOrderModal({
  order,
  productById,
  currency,
  statusTag,
  onClose,
  onSaved,
}: {
  order: OrderDto | null;
  productById: Map<string, ProductDto>;
  currency: Currency | null;
  statusTag: (status: string) => React.ReactNode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setError(null);
    form.setFieldsValue({
      buyTotals: Object.fromEntries(order.items.map((i) => [i.id, i.buyTotalOriginal ?? i.buyTotalSnapshot])),
      supplierUrl: order.supplierUrl ?? "",
      trackingNumber: order.trackingNumber ?? "",
      markShipped: false,
    });
  }, [order, form]);

  if (!order) return null;
  const buyLocked = isInvoiced(order);
  const canShip = order.status === "PROCESSING";

  async function handleSave(values: FormValues) {
    if (!order) return;
    // Send only the lines whose buy total actually changed (and none once invoiced — the API rejects that).
    const buyTotals = buyLocked
      ? []
      : order.items
          .filter((i) => {
            const next = values.buyTotals?.[i.id];
            return next != null && next !== (i.buyTotalOriginal ?? i.buyTotalSnapshot);
          })
          .map((i) => ({ itemId: i.id, buyTotal: values.buyTotals[i.id] as number }));
    setSaving(true);
    setError(null);
    try {
      await updateThreePlOrder(order.id, {
        ...(buyTotals.length ? { buyTotals } : {}),
        supplierUrl: values.supplierUrl ?? "",
        trackingNumber: values.trackingNumber ?? "",
        markShipped: canShip && values.markShipped,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Edit order ${order.ebayOrderRef}`}
      width={640}
      okText="Save"
      onOk={() => form.submit()}
      confirmLoading={saving}
      onCancel={() => !saving && onClose()}
      maskClosable={!saving}
    >
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      {order.comments && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Comments"
          description={<span className="whitespace-pre-wrap">{order.comments}</span>}
        />
      )}

      <Descriptions size="small" column={2} className="mb-4">
        <Descriptions.Item label="Order #">{order.ebayOrderRef}</Descriptions.Item>
        <Descriptions.Item label="Date">{formatDate(order.orderDate)}</Descriptions.Item>
        <Descriptions.Item label="Status">{statusTag(order.status)}</Descriptions.Item>
        <Descriptions.Item label="Qty">{order.items.reduce((sum, i) => sum + i.quantity, 0)}</Descriptions.Item>
      </Descriptions>

      <Form<FormValues> form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>
        <div className="mb-1 text-sm font-medium">Products &amp; buy price</div>
        {buyLocked && (
          <Alert type="info" showIcon className="mb-3" title="This order is on an invoice, so its buy prices can't be changed." />
        )}
        <div className="mb-4 flex flex-col gap-3">
          {order.items.map((item) => {
            const product = productById.get(item.productId);
            return (
              <div key={item.id} className="flex items-center gap-3">
                <ProductThumb product={product} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{product?.title ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {product?.sku ?? "—"} · ×{item.quantity}
                  </div>
                </div>
                <Form.Item name={["buyTotals", item.id]} className="mb-0" tooltip="All units together">
                  <InputNumber
                    min={0}
                    step={0.01}
                    placeholder="Buy price (all units)"
                    prefix={currencySymbol(item.currency ?? currency)}
                    disabled={buyLocked}
                    className="w-44"
                  />
                </Form.Item>
              </div>
            );
          })}
        </div>

        <Form.Item name="supplierUrl" label="Supplier/product listing URL" rules={[{ type: "url", message: "Enter a valid URL" }]}>
          <Input placeholder="https://…" allowClear />
        </Form.Item>
        <Form.Item name="trackingNumber" label="Tracking number" extra="Optional — you can add it later.">
          <Input placeholder="Tracking number" allowClear />
        </Form.Item>
        {canShip ? (
          <Form.Item name="markShipped" label="Mark as shipped" valuePropName="checked" className="mb-0">
            <Switch checkedChildren="SHIPPED" unCheckedChildren="PROCESSING" />
          </Form.Item>
        ) : (
          <div className="text-sm text-slate-500">
            Status: <Tag>{order.status}</Tag>
          </div>
        )}
      </Form>
    </Modal>
  );
}
