"use client";

import type { ProductDto, ProductFulfillmentType, UserDto } from "@ebay-order-management/shared";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import ProductImagesUpload, { productImageItems, type ProductImageItem } from "@/components/ProductImagesUpload";
import { listUsers, type CreateProductPayload } from "@/lib/api";
import { currencySymbol } from "@/lib/currency";
import { searchable, userOptions } from "@/lib/selectOptions";

interface ProductFormProps {
  // Prefills the form for editing; omitted when creating.
  initial?: ProductDto;
  submitLabel: string;
  submittingLabel: string;
  // `images` is the full gallery in display order (first = cover): saved URLs to keep, or new Files.
  onSubmit: (payload: CreateProductPayload, images: Array<string | File>) => Promise<void>;
}

interface ProductFormValues {
  sku: string;
  title: string;
  size?: string;
  fulfillmentType: ProductFulfillmentType;
  stockOwnerId?: string;
  threePlId?: string;
  stockOwnerCost?: number;
  buyPrice?: number;
  sellPrice?: number;
  stockQuantity?: number;
}

/** Shared by /products/add and /products/[id]/edit so both stay field-for-field identical. */
export default function ProductForm({ initial, submitLabel, submittingLabel, onSubmit }: ProductFormProps) {
  const [form] = Form.useForm<ProductFormValues>();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<ProductImageItem[]>(() => productImageItems(initial?.imageUrls));

  useEffect(() => {
    listUsers().then(setUsers).catch(() => undefined);
  }, []);

  const stockOwners = users.filter((u) => u.roles.includes("STOCK_OWNER" as never));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL" as never));

  const fulfillmentType = Form.useWatch("fulfillmentType", form) ?? initial?.fulfillmentType ?? "STOCK";
  const isStock = fulfillmentType === ("STOCK" as ProductFulfillmentType);
  // Prices are entered in the selected Stock Owner's currency (converted to PKR on each order).
  const stockOwnerId = Form.useWatch("stockOwnerId", form) ?? initial?.stockOwnerId;
  const priceCurrency =
    stockOwners.find((u) => u.id === stockOwnerId)?.currency ?? (stockOwnerId === initial?.stockOwnerId ? initial?.currency : undefined);
  const pricePrefix = priceCurrency ? currencySymbol(priceCurrency) : "";

  async function handleFinish(values: ProductFormValues) {
    if (!isStock && images.length === 0) {
      setFormError("A dropship product needs at least one image");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(
        {
          stockOwnerId: isStock ? values.stockOwnerId : undefined,
          fulfillmentType: values.fulfillmentType,
          threePlId: isStock ? values.threePlId : undefined,
          sku: values.sku,
          title: values.title,
          size: values.size?.trim() || undefined,
          stockOwnerCost: isStock ? Number(values.stockOwnerCost ?? 0) : undefined,
          buyPrice: isStock ? Number(values.buyPrice ?? 0) : undefined,
          sellPrice: isStock ? Number(values.sellPrice ?? 0) : undefined,
          stockQuantity: isStock ? Number(values.stockQuantity ?? 0) : undefined,
        },
        images.map((i) => i.file ?? i.existingUrl!),
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save product");
      setSubmitting(false);
    }
  }

  return (
    <Form<ProductFormValues>
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      className="mt-6"
      initialValues={{
        sku: initial?.sku ?? "",
        title: initial?.title ?? "",
        size: initial?.size ?? "",
        fulfillmentType: initial?.fulfillmentType ?? ("STOCK" as ProductFulfillmentType),
        stockOwnerId: initial?.stockOwnerId ?? undefined,
        threePlId: initial?.threePlId ?? undefined,
        stockOwnerCost: initial?.stockOwnerCost ?? 0,
        buyPrice: initial?.buyPrice ?? 0,
        sellPrice: initial?.sellPrice ?? 0,
        stockQuantity: initial?.stockQuantity ?? 0,
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Product details">
            <div className="grid gap-x-4 sm:grid-cols-4">
              <Form.Item name="sku" label="SKU" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="title" label="Title" rules={[{ required: true }]} className="sm:col-span-2">
                <Input />
              </Form.Item>
              <Form.Item name="size" label="Size">
                <Input placeholder="e.g. 8cm x 5cm" />
              </Form.Item>
            </div>
            <Form.Item name="fulfillmentType" label="Fulfillment type" className="mb-0">
              <Select
                options={[
                  { value: "STOCK", label: "Stock — held at a 3PL warehouse" },
                  { value: "DROPSHIP", label: "Dropship — 3PL and buy price are set on each order" },
                ]}
              />
            </Form.Item>
          </Card>

          {isStock && (
            <Card title="Stock Owner & warehouse">
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Form.Item name="stockOwnerId" label="Stock Owner" rules={[{ required: true, message: "Select a Stock Owner" }]} className="mb-0">
                  <Select showSearch={searchable} placeholder="Select…" options={userOptions(stockOwners)} />
                </Form.Item>
                <Form.Item name="threePlId" label="3PL warehouse" rules={[{ required: true, message: "Select a 3PL warehouse" }]} className="mb-0">
                  <Select showSearch={searchable} placeholder="Select…" options={userOptions(threePls)} />
                </Form.Item>
              </div>
            </Card>
          )}

          {isStock && (
            <Card title={priceCurrency ? `Pricing & stock (${priceCurrency})` : "Pricing & stock"}>
              <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4">
                <Form.Item name="stockOwnerCost" label="Stock Owner cost" tooltip="What the item costs the Stock Owner" className="mb-0">
                  <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                </Form.Item>
                <Form.Item name="buyPrice" label="Buy price" tooltip="Paid to the Stock Owner per unit sold" className="mb-0">
                  <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                </Form.Item>
                <Form.Item name="sellPrice" label="Sell price" tooltip="Charged to the Account Holder per unit" className="mb-0">
                  <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                </Form.Item>
                <Form.Item name="stockQuantity" label="Stock quantity" className="mb-0">
                  <InputNumber min={0} precision={0} className="w-full" />
                </Form.Item>
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Images" extra={!isStock && <Tag className="mr-0">At least one required</Tag>}>
            <ProductImagesUpload value={images} onChange={setImages} disabled={submitting} />
          </Card>

          <Card>
            {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={submitting} block size="large">
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </Card>
        </div>
      </div>
    </Form>
  );
}
