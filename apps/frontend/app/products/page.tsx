"use client";

import type { ProductFulfillmentType } from "@ebay-order-management/shared";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ImageCropModal from "@/components/ImageCropModal";
import { getToken, listProducts, mediaUrl, uploadProductImage } from "@/lib/api";

interface ProductRow {
  id: string;
  sku: string;
  title: string;
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
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<string | null>(null);

  function refresh() {
    listProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
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

  function handleCropSave(file: File) {
    if (cropTarget) {
      uploadCroppedImage(cropTarget, file);
    }
    setCropFile(null);
    setCropTarget(null);
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Products</h1>
          <button onClick={() => router.push("/products/add")} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            Add product
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Image</th>
              <th className="py-2">SKU</th>
              <th className="py-2">Title</th>
              <th className="py-2">Type</th>
              <th className="py-2">Buy</th>
              <th className="py-2">Sell</th>
              <th className="py-2">Stock</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => fileInputs.current[p.id]?.click()}
                    className="block h-12 w-12 overflow-hidden rounded border bg-gray-50"
                    title={p.imageUrl ? "Replace image" : "Add image"}
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(p.imageUrl)} alt={p.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                        {uploadingId === p.id ? "…" : "Add"}
                      </span>
                    )}
                  </button>
                  <input
                    ref={(el) => {
                      fileInputs.current[p.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) {
                        setCropFile(file);
                        setCropTarget(p.id);
                      }
                      e.target.value = "";
                    }}
                  />
                </td>
                <td className="py-2">{p.sku}</td>
                <td className="py-2">{p.title}</td>
                <td className="py-2">{p.fulfillmentType}</td>
                <td className="py-2">{p.buyPrice != null ? `$${p.buyPrice.toFixed(2)}` : "—"}</td>
                <td className="py-2">{p.sellPrice != null ? `$${p.sellPrice.toFixed(2)}` : "—"}</td>
                <td className="py-2">{p.fulfillmentType === "DROPSHIP" ? "—" : p.stockQuantity}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-gray-500">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onCancel={() => {
            setCropFile(null);
            setCropTarget(null);
          }}
          onSave={handleCropSave}
        />
      )}
    </>
  );
}
