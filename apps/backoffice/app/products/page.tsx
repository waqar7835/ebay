"use client";

import {
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZES,
  type Currency,
  type ProductFulfillmentType,
  type ProductStockDto,
  type UserDto,
} from "@ebay-order-management/shared";
import { Alert, Badge, Button, Card, Form, Image, Input, InputNumber, Select, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { EditAction } from "@/components/RowActions";
import ProductImagesUpload, { productImageItems, type ProductImageItem } from "@/components/ProductImagesUpload";
import ProductStockRows, { stockFormValues, stockPayloads, stockThreePls, type StockRowValues } from "@/components/ProductStockRows";
import StockLevel from "@/components/StockLevel";
import ProductVariations, {
  saveVariationImages,
  variationFormValues,
  variationPayloads,
  type VariationFormValues,
} from "@/components/ProductVariations";
import { createProduct, getToken, listProductsPage, listUsers, mediaUrl, setProductImages, updateProduct } from "@/lib/api";
import { currencySymbol, money } from "@/lib/currency";
import { searchable, userNameOptions } from "@/lib/selectOptions";

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  /** Set on a variation: its main product. */
  parentProductId: string | null;
  color: string | null;
  size: string | null;
  fulfillmentType: ProductFulfillmentType;
  stockOwnerId: string | null;
  stockOwnerName?: string | null;
  /** Units per 3PL. */
  stocks: ProductStockDto[];
  /** The Stock Owner's currency — prices are in it. */
  currency: Currency | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  imageUrl: string | null;
  imageUrls: string[];
  /** Main products: their variations, shown as expandable child rows (undefined when there are none). */
  variations?: ProductRow[];
}

interface ProductFormValues {
  sku: string;
  title: string;
  color?: string;
  size?: string;
  fulfillmentType: ProductFulfillmentType;
  stockOwnerId?: string;
  /** The 3PLs holding the product and the units at each (Stock only). */
  stocks: StockRowValues[];
  stockOwnerCost?: number;
  buyPrice?: number;
  sellPrice?: number;
  variations: VariationFormValues[];
}

interface ProductFilter {
  stockOwnerId: string;
  fulfillmentType: string;
  title: string;
  sku: string;
  threePlId: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const [form] = Form.useForm<ProductFormValues>();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [images, setImages] = useState<ProductImageItem[]>([]);
  // Server-side paging and filters; the title / SKU boxes are applied after a short pause, not on every keystroke.
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [filter, setFilter] = useState<ProductFilter>({ stockOwnerId: "", fulfillmentType: "", title: "", sku: "", threePlId: "" });
  const [titleInput, setTitleInput] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const requestSeq = useRef(0);

  /** Loads the current page; responses to older requests (filters changed meanwhile) are dropped. */
  function refresh() {
    const seq = ++requestSeq.current;
    setLoading(true);
    listProductsPage(
      {
        stockOwnerId: filter.stockOwnerId || undefined,
        fulfillmentType: (filter.fulfillmentType || undefined) as ProductFulfillmentType | undefined,
        title: filter.title || undefined,
        sku: filter.sku || undefined,
        threePlId: filter.threePlId || undefined,
      },
      page,
      pageSize,
    )
      .then((res) => {
        if (seq !== requestSeq.current) return;
        // A main product without variations gets no expand arrow.
        setProducts(
          (res.data as ProductRow[]).map((p) => ({ ...p, variations: p.variations?.length ? p.variations : undefined })),
        );
        setTotal(res.total);
      })
      .catch((err) => seq === requestSeq.current && setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => seq === requestSeq.current && setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    listUsers()
      .then((list) => setUsers(list as unknown as UserDto[]))
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    if (getToken()) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, pageSize]);

  // Any filter change starts again from the first page.
  function updateFilter(patch: Partial<ProductFilter>) {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (filter.title !== titleInput.trim() || filter.sku !== skuInput.trim())
        updateFilter({ title: titleInput.trim(), sku: skuInput.trim() });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleInput, skuInput]);

  const filtered = Object.values(filter).some(Boolean);

  const stockOwners = users.filter((u) => u.roles.includes("STOCK_OWNER" as never));
  const editingProduct = editingId ? products.find((p) => p.id === editingId) : undefined;
  // Active Stock 3PLs (plus any already holding the product being edited); the filter lists every Stock 3PL.
  const threePls = stockThreePls(users, (editingProduct?.stocks ?? []).map((s) => s.threePlId));
  const filterThreePls = users.filter((u) => u.roles.includes("THREE_PL" as never) && u.threePlProfile?.fulfillmentType === "STOCK");
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
      stocks: stockFormValues(p?.stocks),
      sku: p?.sku ?? "",
      title: p?.title ?? "",
      color: p?.color ?? "",
      size: p?.size ?? "",
      stockOwnerCost: p?.stockOwnerCost ?? 0,
      buyPrice: p?.buyPrice ?? 0,
      sellPrice: p?.sellPrice ?? 0,
      variations: variationFormValues(p?.variations),
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
    // Read from the store: it also holds each row's id / auto-SKU flag.
    const variations: VariationFormValues[] = form.getFieldValue("variations") ?? [];
    const stocks = stockPayloads(values.stocks ?? []);
    setFormError(null);
    setSubmitting(true);
    const payload = {
      stockOwnerId: isStock ? values.stockOwnerId : undefined,
      fulfillmentType: values.fulfillmentType,
      sku: values.sku,
      title: values.title,
      color: values.color?.trim() || undefined,
      size: values.size?.trim() || undefined,
      stockOwnerCost: isStock ? Number(values.stockOwnerCost ?? 0) : undefined,
      buyPrice: isStock ? Number(values.buyPrice ?? 0) : undefined,
      sellPrice: isStock ? Number(values.sellPrice ?? 0) : undefined,
      stocks: isStock ? stocks : undefined,
      variations: variationPayloads(variations, isStock, stocks.map((s) => s.threePlId)),
    };
    try {
      const saved = editingId ? await updateProduct(editingId, payload as never) : await createProduct(payload as never);
      // New products with no images skip the call; edits always resave so removals/reorders apply.
      if (editingId || images.length > 0) {
        await setProductImages(saved.id, images.map((i) => i.file ?? i.existingUrl!));
      }
      await saveVariationImages(
        saved,
        variations.map((v) => (v.images ?? []).map((i) => i.file ?? i.existingUrl!)),
        !!editingId,
      );
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
    { title: "SKU", dataIndex: "sku" },
    { title: "Product owner", key: "owner", render: (_, p) => p.stockOwnerName || "—" },
    { title: "Title", dataIndex: "title" },
    { title: "Color", dataIndex: "color", render: (v) => v || "—" },
    { title: "Size", dataIndex: "size", render: (v) => v || "—" },
    {
      title: "Variations",
      key: "variations",
      // The main product counts as one of them.
      render: (_, p) => (p.parentProductId ? null : p.variations ? <Tag className="mr-0">{p.variations.length + 1}</Tag> : "—"),
    },
    {
      title: "Type",
      dataIndex: "fulfillmentType",
      render: (v: ProductFulfillmentType) =>
        v === "DROPSHIP" ? <Tag color="orange">Dropship</Tag> : <Tag color="blue">Stock</Tag>,
    },
    // In the Stock Owner's currency.
    { title: "Buy", dataIndex: "buyPrice", render: (v: number | null, p) => money(v, p.currency) },
    { title: "Sell", dataIndex: "sellPrice", render: (v: number | null, p) => money(v, p.currency) },
    // Total, with the units at each 3PL on hover.
    {
      title: "Stock",
      key: "stock",
      render: (_, p) => (p.fulfillmentType === "DROPSHIP" ? "—" : <StockLevel total={p.stockQuantity} stocks={p.stocks ?? []} mode="tooltip" />),
    },
    {
      key: "actions",
      // Variations are edited with their main product.
      render: (_, p) => !p.parentProductId && <EditAction onClick={() => startEdit(p)} />,
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
              initialValues={{ fulfillmentType: "STOCK", stockOwnerCost: 0, buyPrice: 0, sellPrice: 0, stocks: [{ quantity: 0 }] }}
            >
              <div className="flex gap-3">
                <Form.Item name="sku" label="SKU" rules={[{ required: true }]} className="flex-1">
                  <Input />
                </Form.Item>
                <Form.Item name="title" label="Title" rules={[{ required: true }]} className="flex-1">
                  <Input />
                </Form.Item>
                <Form.Item
                  name="color"
                  label="Color (optional)"
                  dependencies={["size", "variations"]}
                  rules={[
                    {
                      // Once there are variations, every one (this product included) needs a color or size.
                      validator: (_, color?: string) =>
                        color?.trim() || form.getFieldValue("size")?.trim() || !(form.getFieldValue("variations") ?? []).length
                          ? Promise.resolve()
                          : Promise.reject(new Error("Enter a color or a size")),
                    },
                  ]}
                  className="w-40"
                >
                  <Input placeholder="e.g. Red" />
                </Form.Item>
                <Form.Item name="size" label="Size (optional)" className="w-40">
                  <Input />
                </Form.Item>
              </div>

              {/* Same width as SKU: mirrors the SKU / Title / Color / Size row above. */}
              <div className="flex gap-3">
                <Form.Item name="fulfillmentType" label="Fulfillment type" className="flex-1">
                  <Select
                    options={[
                      { value: "STOCK", label: "Stock" },
                      { value: "DROPSHIP", label: "Dropship" },
                    ]}
                  />
                </Form.Item>
                <div className="flex-1" />
                <div className="w-40" />
                <div className="w-40" />
              </div>

              {isStock && (
                <Form.Item name="stockOwnerId" label="Stock Owner" rules={[{ required: true, message: "Select a Stock Owner" }]}>
                  <Select showSearch={searchable} placeholder="Select…" options={userNameOptions(stockOwners)} />
                </Form.Item>
              )}

              {isStock && (
                <div className="mb-6">
                  <ProductStockRows threePls={threePls} disabled={submitting} />
                </div>
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
                </div>
              )}

              <Form.Item label={isStock ? "Product images (optional)" : "Product images"} required={!isStock}>
                <ProductImagesUpload value={images} onChange={setImages} disabled={submitting} />
              </Form.Item>

              <div className="mb-6">
                <ProductVariations inner isStock={isStock} pricePrefix={pricePrefix} disabled={submitting} threePls={threePls} />
              </div>

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingId ? "Save changes" : "Create"}
              </Button>
            </Form>
          </Card>
        )}

        <Card size="small" className="mt-6">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label>
              Title
              <Input
                allowClear
                placeholder="Search title"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="mt-1 flex w-56"
              />
            </label>
            <label>
              SKU
              <Input
                allowClear
                placeholder="Search SKU"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                className="mt-1 flex w-44"
              />
            </label>
            <label>
              Product owner
              <Select
                showSearch={searchable}
                allowClear
                placeholder="All"
                value={filter.stockOwnerId || undefined}
                onChange={(v) => updateFilter({ stockOwnerId: v ?? "" })}
                options={userNameOptions(stockOwners)}
                className="mt-1 flex w-56"
              />
            </label>
            <label>
              3PL
              <Select
                showSearch={searchable}
                allowClear
                placeholder="All"
                value={filter.threePlId || undefined}
                onChange={(v) => updateFilter({ threePlId: v ?? "" })}
                options={userNameOptions(filterThreePls)}
                className="mt-1 flex w-56"
              />
            </label>
            <label>
              Product type
              <Select
                allowClear
                placeholder="All"
                value={filter.fulfillmentType || undefined}
                onChange={(v) => updateFilter({ fulfillmentType: v ?? "" })}
                options={[
                  { value: "STOCK", label: "Stock" },
                  { value: "DROPSHIP", label: "Dropship" },
                ]}
                className="mt-1 flex w-36"
              />
            </label>
          </div>
        </Card>

        <Table<ProductRow>
          className="mt-4"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={products}
          expandable={{ childrenColumnName: "variations" }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: LIST_PAGE_SIZES.map(String),
            showTotal: (n, [from, to]) => `${from}–${to} of ${n} products`,
            onChange: (p, size) => {
              setPage(size !== pageSize ? 1 : p);
              setPageSize(size);
            },
          }}
          locale={{ emptyText: filtered ? "No products match these filters." : "No products yet." }}
        />
      </main>
    </>
  );
}
