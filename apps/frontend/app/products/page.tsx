"use client";

import type { ProductFulfillmentType } from "@ebay-order-management/shared";
import { Alert, Button, Table, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ImageUpload from "@/components/ImageUpload";
import { getToken, listProducts, mediaUrl, uploadProductImage } from "@/lib/api";

interface ProductRow {
  id: string;
  sku: string;
  title: string;
  size: string | null;
  fulfillmentType: ProductFulfillmentType;
  stockOwnerId: string | null;
  threePlId: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stockQuantity: number;
  imageUrl: string | null;
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

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

  async function uploadCroppedImage(productId: string, file: File) {
    setUploadingId(productId);
    try {
      await uploadProductImage(productId, file);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingId(null);
    }
  }

  const money = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : "—");

  const columns: TableColumnsType<ProductRow> = [
    {
      title: "Image",
      key: "image",
      render: (_, p) => (
        <ImageUpload
          value={null}
          existingUrl={p.imageUrl ? mediaUrl(p.imageUrl) : null}
          uploading={uploadingId === p.id}
          onChange={(file) => file && uploadCroppedImage(p.id, file)}
        />
      ),
    },
    { title: "SKU", dataIndex: "sku", sorter: (a, b) => a.sku.localeCompare(b.sku) },
    { title: "Title", dataIndex: "title", sorter: (a, b) => a.title.localeCompare(b.title) },
    { title: "Size", dataIndex: "size", render: (v) => v || "—" },
    { title: "Type", dataIndex: "fulfillmentType" },
    { title: "Buy", dataIndex: "buyPrice", render: money },
    { title: "Sell", dataIndex: "sellPrice", render: money },
    { title: "Stock", key: "stock", render: (_, p) => (p.fulfillmentType === "DROPSHIP" ? "—" : p.stockQuantity) },
    {
      key: "actions",
      render: (_, p) => (
        <Button size="small" onClick={() => router.push(`/products/${p.id}/edit`)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-5xl p-8">
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
