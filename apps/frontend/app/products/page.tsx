"use client";

import { Role, type Currency, type ProductFulfillmentType } from "@ebay-order-management/shared";
import { Alert, Badge, Button, Image, Table, Tag, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { EditAction } from "@/components/RowActions";
import { getStoredUser, getToken, listProducts, mediaUrl } from "@/lib/api";
import { money } from "@/lib/currency";

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  size: string | null;
  fulfillmentType: ProductFulfillmentType;
  stockOwnerId: string | null;
  threePlId: string | null;
  currency: Currency | null;
  stockOwnerCost: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  imageUrl: string | null;
  imageUrls: string[];
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A Stock Owner gets a read-only list of their own products (the API only returns those) — same test as the backend.
  const roles = getStoredUser()?.roles ?? [];
  const isStockOwnerView =
    roles.includes(Role.STOCK_OWNER) && !roles.some((r) => r === Role.ADMIN || r === Role.STAFF || r === Role.ACCOUNT_HOLDER);

  function refresh() {
    listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    refresh();
  }, [router]);


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
      render: (_, p) => (
        <EditAction onClick={() => router.push(`/products/${p.id}/edit`)} />
      ),
    },
  ];

  // Their own figures in their own currency: Sell price = the buy price the company pays them (as on their orders).
  const stockOwnerColumns: TableColumnsType<ProductRow> = [
    { title: "Cost", dataIndex: "stockOwnerCost", render: (v: number | null, p) => money(v, p.currency) },
    { title: "Sell price", dataIndex: "buyPrice", render: (v: number | null, p) => money(v, p.currency) },
    {
      title: "Stock",
      key: "stock",
      sorter: (a, b) => a.stockQuantity - b.stockQuantity,
      render: (_, p) => (p.fulfillmentType === "DROPSHIP" ? "—" : <StockLevel qty={p.stockQuantity} />),
    },
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
    { title: "SKU", dataIndex: "sku", sorter: (a, b) => a.sku.localeCompare(b.sku) },
    { title: "Title", dataIndex: "title", sorter: (a, b) => a.title.localeCompare(b.title) },
    { title: "Size", dataIndex: "size", render: (v) => v || "—" },
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

/** Remaining stock: red at 0, orange when running low (1–5), a plain number otherwise. */
function StockLevel({ qty }: { qty: number }) {
  if (qty <= 0) return <Tag color="red">Out of stock</Tag>;
  if (qty <= 5) return <Tag color="orange">{qty} left</Tag>;
  return <>{qty}</>;
}
