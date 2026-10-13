"use client";

import {
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZES,
  Role,
  type Currency,
  type ProductFulfillmentType,
  type UserDto,
} from "@ebay-order-management/shared";
import { Alert, Badge, Button, Card, Image, Input, Select, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { EditAction } from "@/components/RowActions";
import { getStoredUser, getToken, listProductsPage, listUsers, mediaUrl } from "@/lib/api";
import { money } from "@/lib/currency";
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
  threePlId: string | null;
  currency: Currency | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  /** Stock Owner view only: units sold on their orders (excl. cancelled/refunded). */
  unitsSold?: number;
  imageUrl: string | null;
  imageUrls: string[];
  /** Main products: their variations, shown as expandable child rows (undefined when there are none). */
  variations?: ProductRow[];
}

interface ProductFilter {
  stockOwnerId: string;
  fulfillmentType: string;
  title: string;
  sku: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockOwners, setStockOwners] = useState<UserDto[]>([]);
  // Applied filters; the title / SKU boxes are copied in after a short pause so each keystroke isn't a request.
  const [filter, setFilter] = useState<ProductFilter>({ stockOwnerId: "", fulfillmentType: "", title: "", sku: "" });
  const [titleInput, setTitleInput] = useState("");
  const [skuInput, setSkuInput] = useState("");

  // A Stock Owner gets a read-only list of their own products (the API only returns those) — same test as the backend.
  const roles = getStoredUser()?.roles ?? [];
  const isStockOwnerView =
    roles.includes(Role.STOCK_OWNER) && !roles.some((r) => r === Role.ADMIN || r === Role.STAFF || r === Role.ACCOUNT_HOLDER);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (!isStockOwnerView)
      listUsers()
        .then((users) => setStockOwners(users.filter((u) => u.roles.includes(Role.STOCK_OWNER))))
        .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Server-side page: refetched whenever a filter, the page or the page size changes.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    setLoading(true);
    listProductsPage(
      {
        stockOwnerId: filter.stockOwnerId || undefined,
        fulfillmentType: (filter.fulfillmentType || undefined) as ProductFulfillmentType | undefined,
        title: filter.title || undefined,
        sku: filter.sku || undefined,
      },
      page,
      pageSize,
    )
      .then((res) => {
        if (cancelled) return;
        // A main product without variations gets no expand arrow.
        setProducts(
          (res.data as ProductRow[]).map((p) => ({ ...p, variations: p.variations?.length ? p.variations : undefined })),
        );
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
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


  const adminColumns: TableColumnsType<ProductRow> = [
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
      // Variations are edited on their main product's page.
      render: (_, p) => !p.parentProductId && <EditAction onClick={() => router.push(`/products/${p.id}/edit`)} />,
    },
  ];

  // Their own figures in their own currency: Sell price = the buy price the company pays them (as on their orders).
  const stockOwnerColumns: TableColumnsType<ProductRow> = [
    { title: "Cost", dataIndex: "stockOwnerCost", render: (v: number | null, p) => money(v, p.currency) },
    { title: "Sell price", dataIndex: "buyPrice", render: (v: number | null, p) => money(v, p.currency) },
    {
      title: "Stock",
      key: "stock",
      render: (_, p) => (p.fulfillmentType === "DROPSHIP" ? "—" : <StockLevel qty={p.stockQuantity} />),
    },
    { title: "Sold", dataIndex: "unitsSold", render: (v?: number) => v ?? 0 },
  ];

  const columns: TableColumnsType<ProductRow> = [
    {
      title: "Image",
      key: "image",
      // Cover thumbnail; clicking opens a preview carousel of the whole gallery. Images are managed on the edit page.
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
    // A Stock Owner only ever sees their own products, so the owner column is for everyone else.
    ...(isStockOwnerView
      ? []
      : [{ title: "Product owner", key: "owner", render: (_: unknown, p: ProductRow) => p.stockOwnerName || "—" }]),
    { title: "Title", dataIndex: "title" },
    { title: "Color", dataIndex: "color", render: (v) => v || "—" },
    { title: "Size", dataIndex: "size", render: (v) => v || "—" },
    {
      title: "Variations",
      key: "variations",
      // The main product counts as one of them.
      render: (_, p) => (p.parentProductId ? null : p.variations ? <Tag className="mr-0">{p.variations.length + 1}</Tag> : "—"),
    },
    ...(isStockOwnerView ? stockOwnerColumns : adminColumns),
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Products</h1>
          {!isStockOwnerView && (
            <Button type="primary" onClick={() => router.push("/products/add")}>
              Add product
            </Button>
          )}
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <Card size="small" className="mt-4">
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
            {!isStockOwnerView && (
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
            )}
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

/** Remaining stock: red at 0, orange when running low (1–5), a plain number otherwise. */
function StockLevel({ qty }: { qty: number }) {
  if (qty <= 0) return <Tag color="red">Out of stock</Tag>;
  if (qty <= 5) return <Tag color="orange">{qty} left</Tag>;
  return <>{qty}</>;
}
