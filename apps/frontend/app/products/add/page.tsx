"use client";

import { Button } from "antd";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ProductForm from "@/components/ProductForm";
import { createProduct, getToken, setProductImages } from "@/lib/api";

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
          <Button onClick={() => router.push("/products")}>Back to products</Button>
        </div>

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
