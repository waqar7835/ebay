"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import ProductForm from "@/components/ProductForm";
import { createProduct, getToken, setProductImages } from "@/lib/api";

export default function AddProductPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
    }
  }, [router]);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <BackLink href="/products" label="Products" title="Add product" />

        <ProductForm
          submitLabel="Create"
          submittingLabel="Creating..."
          onSubmit={async (payload, images) => {
            const created = await createProduct(payload);
            if (images.length > 0) {
              await setProductImages(created.id, images);
            }
            router.push("/products");
          }}
        />
      </main>
    </>
  );
}
