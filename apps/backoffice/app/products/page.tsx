"use client";

import type { ProductFulfillmentType } from "@ebay-order-management/shared";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ImageCropModal from "@/components/ImageCropModal";
import { API_URL, createProduct, getToken, listProducts, listUsers, uploadProductImage } from "@/lib/api";

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

interface UserOption {
  id: string;
  email: string;
  roles: string[];
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const newProductFileInput = useRef<HTMLInputElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<"create" | string | null>(null);

  const [stockOwnerId, setStockOwnerId] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);
  const [threePlId, setThreePlId] = useState("");
  const [sku, setSku] = useState("");
  const [title, setTitle] = useState("");
  const [stockOwnerCost, setStockOwnerCost] = useState("0");
  const [buyPrice, setBuyPrice] = useState("0");
  const [sellPrice, setSellPrice] = useState("0");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

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
    listUsers().then(setUsers as never).catch(() => undefined);
  }, [router]);

  const stockOwners = users.filter((u) => u.roles.includes("STOCK_OWNER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  const isStock = fulfillmentType === ("STOCK" as ProductFulfillmentType);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const created = await createProduct({
        stockOwnerId: isStock ? stockOwnerId : undefined,
        fulfillmentType,
        threePlId: isStock ? threePlId : undefined,
        sku,
        title,
        stockOwnerCost: isStock ? Number(stockOwnerCost) : undefined,
        buyPrice: isStock ? Number(buyPrice) : undefined,
        sellPrice: isStock ? Number(sellPrice) : undefined,
        stockQuantity: isStock ? Number(stockQuantity) : undefined,
      });
      if (image) {
        await uploadProductImage(created.id, image);
      }
      setShowForm(false);
      setSku("");
      setTitle("");
      setImage(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create product");
    }
  }

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
    if (cropTarget === "create") {
      setImage(file);
    } else if (cropTarget) {
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
          <button onClick={() => setShowForm((v) => !v)} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
            {showForm ? "Cancel" : "Add product"}
          </button>
        </div>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-3 rounded border bg-white p-4 text-sm">
            <div className="flex gap-3">
              <input placeholder="SKU" required value={sku} onChange={(e) => setSku(e.target.value)} className="flex-1 rounded border px-2 py-1" />
              <input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 rounded border px-2 py-1" />
            </div>

            <label>
              Fulfillment type
              <select
                value={fulfillmentType}
                onChange={(e) => setFulfillmentType(e.target.value as ProductFulfillmentType)}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="STOCK">Stock (held by a 3PL)</option>
                <option value="DROPSHIP">Dropship</option>
              </select>
            </label>

            {isStock && (
              <label>
                Stock Owner
                <select required value={stockOwnerId} onChange={(e) => setStockOwnerId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1">
                  <option value="">Select…</option>
                  {stockOwners.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {fulfillmentType === ("STOCK" as ProductFulfillmentType) && (
              <label>
                3PL warehouse
                <select required value={threePlId} onChange={(e) => setThreePlId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1">
                  <option value="">Select…</option>
                  {threePls.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isStock && (
              <div className="flex gap-3">
                <label className="flex-1">
                  Stock Owner cost
                  <input value={stockOwnerCost} onChange={(e) => setStockOwnerCost(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
                <label className="flex-1">
                  Buy price (paid to Stock Owner)
                  <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
                <label className="flex-1">
                  Sell price (charged to Account Holder)
                  <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
                <label className="flex-1">
                  Stock quantity
                  <input value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
                </label>
              </div>
            )}

            <label>
              Product image (optional)
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => newProductFileInput.current?.click()}
                  className="h-14 w-14 overflow-hidden rounded border bg-gray-50"
                >
                  {imagePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreviewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">Add</span>
                  )}
                </button>
                {image && (
                  <button type="button" onClick={() => setImage(null)} className="text-xs text-gray-500 underline">
                    Remove
                  </button>
                )}
                <input
                  ref={newProductFileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      setCropFile(file);
                      setCropTarget("create");
                    }
                    e.target.value = "";
                  }}
                />
              </div>
            </label>

            {formError && <p className="text-red-600">{formError}</p>}
            <button type="submit" className="self-start rounded bg-gray-900 px-3 py-2 text-white">
              Create
            </button>
          </form>
        )}

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
                      <img src={`${API_URL}${p.imageUrl}`} alt={p.title} className="h-full w-full object-cover" />
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
