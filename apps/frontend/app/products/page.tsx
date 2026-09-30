"use client";

import type { Currency, ProductFulfillmentType } from "@ebay-order-management/shared";
import { Alert, Badge, Button, Image, Table, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { EditAction } from "@/components/RowActions";
import { getToken, listProducts, mediaUrl } from "@/lib/api";
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
  }, [router]);


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
    { title: "Type", dataIndex: "fulfillmentType" },
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

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Products</h1>
          <Button type="primary" onClick={() => router.push("/products/add")}>
            Add product
          </Button>
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
