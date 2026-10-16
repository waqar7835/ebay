"use client";

import type { ProductDto } from "@ebay-order-management/shared";
import { Alert } from "antd";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import ProductForm from "@/components/ProductForm";
import { saveVariationImages } from "@/components/ProductVariations";
import { getProduct, getToken, updateProduct, setProductImages } from "@/lib/api";
import { listHref } from "@/lib/listQuery";

export default function EditProductPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    getProduct(id)
      .then((p) => {
        // Variations are edited on their main product's page.
        if (p.parentProductId) router.replace(`/products/${p.parentProductId}/edit`);
        else setProduct(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load product"));
  }, [router, id]);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <BackLink href="/products" label="Products" title="Edit product" />

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {product && (
          <ProductForm
            initial={product}
            submitLabel="Save changes"
            submittingLabel="Saving..."
            onSubmit={async (payload, images, variationImages) => {
              const saved = await updateProduct(product.id, payload);
              await setProductImages(product.id, images);
              await saveVariationImages(saved, variationImages, true);
              router.push(listHref("/products"));
            }}
          />
        )}
      </main>
    </>
  );
}
