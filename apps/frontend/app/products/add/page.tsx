"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ProductForm from "@/components/ProductForm";
import { createProduct, getToken, uploadProductImage } from "@/lib/api";

export default function AddProductPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
    }
  }, [router]);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Add product</h1>
          <button onClick={() => router.push("/products")} className="rounded border px-3 py-2 text-sm">
            Back to products
          </button>
        </div>

        <ProductForm
          submitLabel="Create"
          submittingLabel="Creating..."
          onSubmit={async (payload, image) => {
            const created = await createProduct(payload);
            if (image) {
              await uploadProductImage(created.id, image);
            }
            router.push("/products");
          }}
        />
      </main>
    </>
  );
}
