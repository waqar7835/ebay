"use client";

import type { ProductDto, ProductFulfillmentType, UserDto } from "@ebay-order-management/shared";
import { Alert, Button, Card, Form, Input, InputNumber, Select } from "antd";
import { useEffect, useState } from "react";
import ProductImagesUpload, { productImageItems, type ProductImageItem } from "@/components/ProductImagesUpload";
import { listUsers, type CreateProductPayload } from "@/lib/api";
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

  async function handleFinish(values: ProductFormValues) {
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
    <Card className="mt-6">
      <Form<ProductFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
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
        <div className="flex gap-3">
          <Form.Item name="sku" label="SKU" rules={[{ required: true }]} className="flex-1">
            <Input />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]} className="flex-1">
            <Input />
          </Form.Item>
          <Form.Item name="size" label="Size (optional)" className="w-40">
            <Input />
          </Form.Item>
        </div>

        <Form.Item name="fulfillmentType" label="Fulfillment type">
          <Select
            options={[
              { value: "STOCK", label: "Stock" },
              { value: "DROPSHIP", label: "Dropship" },
            ]}
          />
        </Form.Item>

        {isStock && (
          <Form.Item name="stockOwnerId" label="Stock Owner" rules={[{ required: true, message: "Select a Stock Owner" }]}>
            <Select showSearch={searchable} placeholder="Select…" options={userOptions(stockOwners)} />
          </Form.Item>
        )}

        {isStock && (
          <Form.Item name="threePlId" label="3PL warehouse" rules={[{ required: true, message: "Select a 3PL warehouse" }]}>
            <Select showSearch={searchable} placeholder="Select…" options={userOptions(threePls)} />
          </Form.Item>
        )}

        {isStock && (
          <div className="flex gap-3">
            <Form.Item name="stockOwnerCost" label="Stock Owner cost" className="flex-1">
              <InputNumber prefix="$" min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="buyPrice" label="Buy price (paid to Stock Owner)" className="flex-1">
              <InputNumber prefix="$" min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="sellPrice" label="Sell price (charged to Account Holder)" className="flex-1">
              <InputNumber prefix="$" min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="stockQuantity" label="Stock quantity" className="flex-1">
              <InputNumber min={0} precision={0} className="w-full" />
            </Form.Item>
          </div>
        )}

        <Form.Item label="Product images (optional)">
          <ProductImagesUpload value={images} onChange={setImages} disabled={submitting} />
        </Form.Item>

        {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
        <Button type="primary" htmlType="submit" loading={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </Form>
    </Card>
  );
}
