"use client";

import type { OrderDto, OrderItemInput, ProductDto, UserDto } from "@ebay-order-management/shared";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import DateField from "@/components/DateField";
import FileUpload from "@/components/FileUpload";
import ProductThumb from "@/components/ProductThumb";
import { listProducts, listUsers, localDateOnly, mediaUrl, type CreateOrderPayload } from "@/lib/api";
import { searchable, userOptions } from "@/lib/selectOptions";

interface OrderFormProps {
  // Prefills the form for editing; omitted when creating.
  initial?: OrderDto;
  submitLabel: string;
  submittingLabel: string;
  // On edit, `items`/`threePlId` are only included when they changed (see handleFinish).
  onSubmit: (payload: CreateOrderPayload, shippingLabel: File | null) => Promise<void>;
}

interface ItemRow {
  productId?: string;
  quantity: number;
}

interface OrderFormValues {
  orderDate: string;
  accountHolderId: string;
  items: ItemRow[];
  threePlId?: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost: number;
  supplierUrl?: string;
}

const money = (v: number) => `$${v.toFixed(2)}`;

/** Shared by /orders/new and /orders/[id]/edit so both stay field-for-field identical. */
export default function OrderForm({ initial, submitLabel, submittingLabel, onSubmit }: OrderFormProps) {
  const [form] = Form.useForm<OrderFormValues>();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shippingLabel, setShippingLabel] = useState<File | null>(null);

  useEffect(() => {
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers).catch(() => undefined);
  }, []);

  const productById = new Map(products.map((p) => [p.id, p]));
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER" as never));

  const rows: ItemRow[] = Form.useWatch("items", form) ?? [];
  const selected = rows.map((r) => (r?.productId ? productById.get(r.productId) : undefined));
  const chosen = selected.filter((p): p is ProductDto => !!p);
  const fulfillmentType = chosen[0]?.fulfillmentType;
  const isDropship = fulfillmentType === "DROPSHIP";
  const warehouses = new Set(chosen.filter((p) => p.fulfillmentType === "STOCK").map((p) => p.threePlId).filter(Boolean));
  const mixedWarehouses = warehouses.size > 1;
  const sellTotal = rows.reduce((sum, r, i) => sum + (selected[i]?.sellPrice ?? 0) * (r?.quantity ?? 0), 0);
  const unitCount = rows.reduce((sum, r) => sum + (r?.quantity ?? 0), 0);

  const eligibleThreePls = users.filter(
    (u) => u.roles.includes("THREE_PL" as never) && u.threePlProfile?.fulfillmentType === fulfillmentType,
  );
  const userById = new Map(users.map((u) => [u.id, u]));

  const initialItems: ItemRow[] = initial?.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) ?? [{ quantity: 1 }];
  const itemsChanged =
    !initial ||
    rows.length !== initial.items.length ||
    rows.some((r, i) => r?.productId !== initial.items[i]?.productId || r?.quantity !== initial.items[i]?.quantity);
  const addedProduct = !!initial && rows.some((r) => r?.productId && !initial.items.some((i) => i.productId === r.productId));

  /** Options for one row: other rows' products are hidden; with several rows only Stock products at the same 3PL fit. */
  function optionsFor(index: number) {
    const others = rows.map((r, i) => (i === index ? undefined : r?.productId)).filter(Boolean);
    const otherProducts = others.map((id) => productById.get(id!)).filter((p): p is ProductDto => !!p);
    const otherWarehouse = otherProducts.find((p) => p.fulfillmentType === "STOCK")?.threePlId;
    return products
      .filter((p) => !others.includes(p.id))
      .map((p) => {
        const reason =
          rows.length > 1 && p.fulfillmentType === "DROPSHIP"
            ? "dropship — order alone"
            : otherWarehouse && p.threePlId !== otherWarehouse
              ? "at another 3PL"
              : null;
        return { value: p.id, label: `${p.sku} — ${p.title}`, disabled: !!reason, reason, product: p };
      });
  }

  function handleProductChange(index: number, productId: string) {
    const next = rows.map((r, i) => (i === index ? { ...r, productId } : r));
    const first = next.map((r) => (r?.productId ? productById.get(r.productId) : undefined)).find(Boolean);
    if (first?.fulfillmentType === "STOCK") {
      form.setFieldValue("threePlId", first.threePlId ?? undefined);
    } else if (first?.fulfillmentType === "DROPSHIP") {
      // Keep an already-assigned dropship 3PL when staying on DROPSHIP.
      const wasDropship = initial?.items.some((i) => productById.get(i.productId)?.fulfillmentType === "DROPSHIP");
      form.setFieldValue("threePlId", wasDropship ? (initial?.threePlId ?? undefined) : undefined);
    }
  }

  async function handleFinish(values: OrderFormValues) {
    if (mixedWarehouses) return;
    setFormError(null);
    setSubmitting(true);
    const items: OrderItemInput[] = values.items.map((r) => ({ productId: r.productId!, quantity: Number(r.quantity) }));
    const threePlId = values.threePlId || undefined;
    // On edit only send what changed: re-sending items would re-validate products that haven't changed.
    const threePlChanged = !initial || (threePlId ?? null) !== initial.threePlId;
    try {
      await onSubmit(
        {
          accountHolderId: values.accountHolderId,
          ...(itemsChanged ? { items } : {}),
          ...(itemsChanged || threePlChanged ? { threePlId } : {}),
          orderDate: values.orderDate,
          ebayOrderRef: values.ebayOrderRef,
          trackingNumber: values.trackingNumber || undefined,
          buyerDetails: values.buyerDetails,
          ebayNetProceeds: Number(values.ebayNetProceeds ?? 0),
          shippingCost: Number(values.shippingCost ?? 0),
          supplierUrl: values.supplierUrl || undefined,
        } as CreateOrderPayload,
        shippingLabel,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save order");
      setSubmitting(false);
    }
  }

  return (
    <Form<OrderFormValues>
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      className="mt-6"
      initialValues={{
        orderDate: initial?.orderDate ?? localDateOnly(),
        accountHolderId: initial?.accountHolderId,
        items: initialItems,
        threePlId: initial?.threePlId ?? undefined,
        ebayOrderRef: initial?.ebayOrderRef ?? "",
        trackingNumber: initial?.trackingNumber ?? "",
        buyerDetails: initial?.buyerDetails ?? "",
        ebayNetProceeds: initial?.ebayNetProceeds ?? 0,
        shippingCost: initial?.shippingCost ?? 0,
        supplierUrl: initial?.supplierUrl ?? "",
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Order details">
            <div className="grid gap-x-4 sm:grid-cols-3">
              <Form.Item name="orderDate" label="Order date" rules={[{ required: true }]}>
                <DateField allowClear={false} className="w-full" />
              </Form.Item>
              <Form.Item
                name="accountHolderId"
                label="Client (Account Holder)"
                rules={[{ required: true, message: "Select a client" }]}
                className="sm:col-span-2"
              >
                <Select showSearch={searchable} placeholder="Select…" options={userOptions(accountHolders)} />
              </Form.Item>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Form.Item name="ebayOrderRef" label="eBay order number" rules={[{ required: true }]} className="mb-0">
                <Input placeholder="eBay order number" />
              </Form.Item>
              <Form.Item name="trackingNumber" label="Tracking number" className="mb-0">
                <Input placeholder="Tracking number" />
              </Form.Item>
            </div>
          </Card>

          <Card
            title="Products"
            extra={unitCount > 0 && <Tag>{`${rows.length} product${rows.length === 1 ? "" : "s"} · ${unitCount} unit${unitCount === 1 ? "" : "s"}`}</Tag>}
          >
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => {
                    const product = selected[index];
                    return (
                      <div key={field.key} className="flex items-start gap-4 rounded-xl border border-slate-200 p-3">
                        <ProductThumb product={product} size={88} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-3">
                            <Form.Item
                              name={[field.name, "productId"]}
                              rules={[{ required: true, message: "Select a product" }]}
                              className="mb-0 min-w-0 flex-1"
                            >
                              <Select
                                showSearch={searchable}
                                placeholder="Select a product…"
                                options={optionsFor(index)}
                                onChange={(id: string) => handleProductChange(index, id)}
                                optionRender={(option) => {
                                  const p = option.data.product as ProductDto;
                                  return (
                                    <div className="flex items-center gap-3 py-1">
                                      <ProductThumb product={p} size={40} />
                                      <div className="min-w-0">
                                        <div className="truncate">{option.data.label}</div>
                                        <div className="text-xs text-slate-500">
                                          {p.fulfillmentType === "DROPSHIP" ? "Dropshipping" : `Stock · ${p.stockQuantity} on hand`}
                                          {option.data.reason ? ` · ${option.data.reason}` : ""}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                            </Form.Item>
                            <Form.Item name={[field.name, "quantity"]} rules={[{ required: true, message: "Qty" }]} className="mb-0 w-24">
                              <InputNumber min={1} precision={0} prefix="×" className="w-full" />
                            </Form.Item>
                            {fields.length > 1 && (
                              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} title="Remove product" />
                            )}
                          </div>
                          {product && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>
                                <Tag color={product.fulfillmentType === "DROPSHIP" ? "orange" : "blue"} className="mr-0">
                                  {product.fulfillmentType === "DROPSHIP" ? "Dropshipping" : "Stock"}
                                </Tag>
                              </span>
                              {product.size && <span>Size {product.size}</span>}
                              {product.fulfillmentType === "STOCK" && <span>{product.stockQuantity} on hand</span>}
                              {product.sellPrice != null && <span>Sell {money(product.sellPrice)} / unit</span>}
                              {product.threePlId && <span>3PL: {userById.get(product.threePlId)?.name ?? userById.get(product.threePlId)?.email ?? "—"}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!isDropship && (
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} block>
                      Add product
                    </Button>
                  )}
                </div>
              )}
            </Form.List>

            {isDropship && <p className="mb-0 mt-3 text-xs text-slate-500">Dropship orders hold a single product. Only Stock products can be combined.</p>}
            {mixedWarehouses && (
              <Alert type="error" showIcon className="mt-3" title="These products are held at different 3PLs — an order can only ship from one 3PL." />
            )}
            {addedProduct && (
              <Alert
                type="info"
                showIcon
                className="mt-3"
                title="Newly added products copy their current prices and Stock Owner terms. Products already on the order keep theirs."
              />
            )}

            {fulfillmentType && (
              <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
                <Form.Item
                  name="threePlId"
                  label={`3PL ${isDropship ? "(optional)" : ""}`}
                  tooltip="The 3PL fee is charged once per order, however many products it has"
                  rules={[{ required: !isDropship, message: "Select a 3PL" }]}
                  extra={
                    eligibleThreePls.length === 0
                      ? `No 3PL users are set up for ${isDropship ? "Dropshipping" : "Stock"} fulfillment yet.`
                      : undefined
                  }
                  className="mb-0"
                >
                  <Select
                    showSearch={searchable}
                    allowClear={isDropship}
                    placeholder={isDropship ? "None" : "Select…"}
                    options={userOptions(eligibleThreePls)}
                  />
                </Form.Item>
                {isDropship && (
                  <Form.Item name="supplierUrl" label="Supplier/product listing URL" className="mb-0">
                    <Input placeholder="https://…" />
                  </Form.Item>
                )}
              </div>
            )}
          </Card>

          <Card title="Buyer">
            <Form.Item name="buyerDetails" label="Name, address, phone number" rules={[{ required: true }]} className="mb-0">
              <Input.TextArea rows={5} placeholder={"Name\nAddress\nPhone number"} />
            </Form.Item>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Amounts">
            <Form.Item name="ebayNetProceeds" label="eBay payout" tooltip="Net proceeds from eBay for this order">
              <InputNumber prefix="$" step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="shippingCost" label="Shipping label cost" className="mb-3">
              <InputNumber prefix="$" min={0} step={0.01} className="w-full" />
            </Form.Item>
            {!isDropship && chosen.length > 0 && (
              <div className="flex justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
                <span>Products at sell price</span>
                <span className="font-medium text-slate-700">{money(sellTotal)}</span>
              </div>
            )}
          </Card>

          <Card title="Shipping label">
            <FileUpload value={shippingLabel} onChange={setShippingLabel} accept="application/pdf" label="Select PDF" />
            {initial?.shippingLabelUrl && (
              <a href={mediaUrl(initial.shippingLabelUrl)} target="_blank" rel="noreferrer" className="mt-2 block text-sm">
                View current shipping label
              </a>
            )}
          </Card>

          <Card>
            {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={submitting} disabled={mixedWarehouses} block size="large">
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </Card>
        </div>
      </div>
    </Form>
  );
}
