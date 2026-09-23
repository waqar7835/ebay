"use client";

import type { ProductDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ProductForm from "@/components/ProductForm";
import { getProduct, getToken, updateProduct, uploadProductImage } from "@/lib/api";

export default function EditProductPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    getProduct(id)
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load product"));
  }, [router, id]);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit product</h1>
          <button onClick={() => router.push("/products")} className="rounded border px-3 py-2 text-sm">
            Back to products
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        {product && (
          <ProductForm
            initial={product}
            submitLabel="Save changes"
            submittingLabel="Saving..."
            onSubmit={async (payload, image) => {
              await updateProduct(product.id, payload);
              if (image) {
                await uploadProductImage(product.id, image);
              }
              router.push("/products");
            }}
          />
        )}
      </main>
    </>
  );
}
