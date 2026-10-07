"use client";

import type { Currency, ProductFulfillmentType } from "@ebay-order-management/shared";
import { Alert, Badge, Button, Card, Form, Image, Input, InputNumber, Select, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { EditAction } from "@/components/RowActions";
import ProductImagesUpload, { productImageItems, type ProductImageItem } from "@/components/ProductImagesUpload";
import { createProduct, getToken, listProducts, listUsers, mediaUrl, setProductImages, updateProduct } from "@/lib/api";
import { currencySymbol, money } from "@/lib/currency";
import { searchable, userOptions } from "@/lib/selectOptions";

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  size: string | null;
  fulfillmentType: ProductFulfillmentType;
  stockOwnerId: string | null;
  threePlId: string | null;
  /** The Stock Owner's currency — prices are in it. */
  currency: Currency | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  imageUrl: string | null;
  imageUrls: string[];
}

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
  currency: Currency;
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

export default function ProductsPage() {
  const router = useRouter();
  const [form] = Form.useForm<ProductFormValues>();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [images, setImages] = useState<ProductImageItem[]>([]);

  function refresh() {
    listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    listUsers().then(setUsers as never).catch(() => undefined);
  }, [router]);

  const stockOwners = users.filter((u) => u.roles.includes("STOCK_OWNER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  const editingProduct = editingId ? products.find((p) => p.id === editingId) : undefined;
  const fulfillmentType = Form.useWatch("fulfillmentType", form) ?? ("STOCK" as ProductFulfillmentType);
  const isStock = fulfillmentType === ("STOCK" as ProductFulfillmentType);
  // Prices are entered in the selected Stock Owner's currency.
  const selectedStockOwnerId = Form.useWatch("stockOwnerId", form);
  const priceCurrency = stockOwners.find((u) => u.id === selectedStockOwnerId)?.currency;
  const pricePrefix = priceCurrency ? currencySymbol(priceCurrency) : "";

  // Loads a row into the create form (or blanks it for a new product) — one form serves both.
  function fillForm(p: ProductRow | null) {
    setEditingId(p?.id ?? null);
    form.setFieldsValue({
      fulfillmentType: p?.fulfillmentType ?? ("STOCK" as ProductFulfillmentType),
      stockOwnerId: p?.stockOwnerId ?? undefined,
      threePlId: p?.threePlId ?? undefined,
      sku: p?.sku ?? "",
      title: p?.title ?? "",
      size: p?.size ?? "",
      stockOwnerCost: p?.stockOwnerCost ?? 0,
      buyPrice: p?.buyPrice ?? 0,
      sellPrice: p?.sellPrice ?? 0,
      stockQuantity: p?.stockQuantity ?? 0,
    });
    setImages(productImageItems(p?.imageUrls));
    setFormError(null);
  }

  function startEdit(p: ProductRow) {
    setShowForm(true);
    // Form mounts on the same tick it's shown; defer so setFieldsValue hits the mounted fields.
    setTimeout(() => fillForm(p));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleFinish(values: ProductFormValues) {
    if (!isStock && images.length === 0) {
      setFormError("A dropship product needs at least one image");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const payload = {
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
    };
    try {
      const saved = editingId ? await updateProduct(editingId, payload as never) : await createProduct(payload as never);
      // New products with no images skip the call; edits always resave so removals/reorders apply.
      if (editingId || images.length > 0) {
        await setProductImages(saved.id, images.map((i) => i.file ?? i.existingUrl!));
      }
      setShowForm(false);
      fillForm(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : editingId ? "Failed to update product" : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  }


  const columns: TableColumnsType<ProductRow> = [
    {
      title: "Image",
      key: "image",
      // Cover thumbnail; clicking opens a preview carousel of the whole gallery. Images are managed via Edit.
      render: (_, p) =>
        p.imageUrl ? (
          <Badge count={p.imageUrls.length > 1 ? p.imageUrls.length : 0} size="small" color="blue">
            <Image.PreviewGroup items={p.imageUrls.map((url) => mediaUrl(url))}>
              <Image src={mediaUrl(p.imageUrl)} alt={p.title} width={48} height={48} className="rounded object-cover" />
            </Image.PreviewGroup>
          </Badge>
        ) : (
          "—"
        ),
    },
    { title: "SKU", dataIndex: "sku", sorter: (a, b) => a.sku.localeCompare(b.sku) },
    { title: "Title", dataIndex: "title", sorter: (a, b) => a.title.localeCompare(b.title) },
    { title: "Size", dataIndex: "size", render: (v) => v || "—" },
    {
      title: "Type",
      dataIndex: "fulfillmentType",
      render: (v: ProductFulfillmentType) =>
        v === "DROPSHIP" ? <Tag color="orange">Dropship</Tag> : <Tag color="blue">Stock</Tag>,
    },
    // In the Stock Owner's currency.
    { title: "Buy", dataIndex: "buyPrice", render: (v: number | null, p) => money(v, p.currency) },
    { title: "Sell", dataIndex: "sellPrice", render: (v: number | null, p) => money(v, p.currency) },
    { title: "Stock", key: "stock", render: (_, p) => (p.fulfillmentType === "DROPSHIP" ? "—" : p.stockQuantity) },
    {
      key: "actions",
      render: (_, p) => (
        <EditAction onClick={() => startEdit(p)} />
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Products</h1>
          <Button
            type={showForm ? "default" : "primary"}
            onClick={() => {
              if (!showForm) setTimeout(() => fillForm(null));
              setShowForm((v) => !v);
            }}
          >
            {showForm ? "Cancel" : "Add product"}
          </Button>
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {showForm && (
          <Card className="mt-6" title={editingProduct ? `Editing ${editingProduct.sku}` : "New product"}>
            <Form<ProductFormValues>
              form={form}
              layout="vertical"
              onFinish={handleFinish}
              initialValues={{ fulfillmentType: "STOCK", stockOwnerCost: 0, buyPrice: 0, sellPrice: 0, stockQuantity: 0 }}
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
                    { value: "STOCK", label: "Stock (held by a 3PL)" },
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
                    <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                  </Form.Item>
                  <Form.Item name="buyPrice" label="Buy price (paid to Stock Owner)" className="flex-1">
                    <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                  </Form.Item>
                  <Form.Item name="sellPrice" label="Sell price (charged to Account Holder)" className="flex-1">
                    <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                  </Form.Item>
                  <Form.Item name="stockQuantity" label="Stock quantity" className="flex-1">
                    <InputNumber min={0} precision={0} className="w-full" />
                  </Form.Item>
                </div>
              )}

              <Form.Item label={isStock ? "Product images (optional)" : "Product images"} required={!isStock}>
                <ProductImagesUpload value={images} onChange={setImages} disabled={submitting} />
              </Form.Item>

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingId ? "Save changes" : "Create"}
              </Button>
            </Form>
          </Card>
        )}

        <Table<ProductRow>
          className="mt-6"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={products}
          pagination={false}
          locale={{ emptyText: "No products yet." }}
        />
      </main>
    </>
  );
}
