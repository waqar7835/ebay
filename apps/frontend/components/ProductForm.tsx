"use client";

import type { ProductDto, ProductFulfillmentType } from "@ebay-order-management/shared";
import { useEffect, useRef, useState } from "react";
import ImageCropModal from "@/components/ImageCropModal";
import { listUsers, mediaUrl, type CreateProductPayload } from "@/lib/api";

interface UserOption {
  id: string;
  email: string;
  roles: string[];
}

interface ProductFormProps {
  // Prefills the form for editing; omitted when creating.
  initial?: ProductDto;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: CreateProductPayload, image: File | null) => Promise<void>;
}

/** Shared by /products/add and /products/[id]/edit so both stay field-for-field identical. */
export default function ProductForm({ initial, submitLabel, submittingLabel, onSubmit }: ProductFormProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const newProductFileInput = useRef<HTMLInputElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [stockOwnerId, setStockOwnerId] = useState(initial?.stockOwnerId ?? "");
  const [fulfillmentType, setFulfillmentType] = useState<ProductFulfillmentType>(
    initial?.fulfillmentType ?? ("STOCK" as ProductFulfillmentType),
  );
  const [threePlId, setThreePlId] = useState(initial?.threePlId ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [size, setSize] = useState(initial?.size ?? "");
  const [stockOwnerCost, setStockOwnerCost] = useState(String(initial?.stockOwnerCost ?? 0));
  const [buyPrice, setBuyPrice] = useState(String(initial?.buyPrice ?? 0));
  const [sellPrice, setSellPrice] = useState(String(initial?.sellPrice ?? 0));
  const [stockQuantity, setStockQuantity] = useState(String(initial?.stockQuantity ?? 0));
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    listUsers().then(setUsers as never).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const stockOwners = users.filter((u) => u.roles.includes("STOCK_OWNER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  const isStock = fulfillmentType === ("STOCK" as ProductFulfillmentType);
  const existingImageUrl = initial?.imageUrl ? mediaUrl(initial.imageUrl) : null;
  const shownImageUrl = imagePreviewUrl ?? existingImageUrl;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(
        {
          stockOwnerId: isStock ? stockOwnerId : undefined,
          fulfillmentType,
          threePlId: isStock ? threePlId : undefined,
          sku,
          title,
          size: size.trim() || undefined,
          stockOwnerCost: isStock ? Number(stockOwnerCost) : undefined,
          buyPrice: isStock ? Number(buyPrice) : undefined,
          sellPrice: isStock ? Number(sellPrice) : undefined,
          stockQuantity: isStock ? Number(stockQuantity) : undefined,
        },
        image,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save product");
      setSubmitting(false);
    }
  }

  function handleCropSave(file: File) {
    setImage(file);
    setCropFile(null);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border bg-white p-4 text-sm">
        <div className="flex gap-3">
          <input placeholder="SKU" required value={sku} onChange={(e) => setSku(e.target.value)} className="flex-1 rounded border px-2 py-1" />
          <input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 rounded border px-2 py-1" />
          <input placeholder="Size (optional)" value={size} onChange={(e) => setSize(e.target.value)} className="w-40 rounded border px-2 py-1" />
        </div>

        <label>
          Fulfillment type
          <select
            value={fulfillmentType}
            onChange={(e) => setFulfillmentType(e.target.value as ProductFulfillmentType)}
            className="mt-1 w-full rounded border px-2 py-1"
          >
            <option value="STOCK">Stock</option>
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

        {isStock && (
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
              {shownImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownImageUrl} alt="" className="h-full w-full object-cover" />
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
                }
                e.target.value = "";
              }}
            />
          </div>
        </label>

        {formError && <p className="text-red-600">{formError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 self-start rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-70"
        >
          {submitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {submitting ? submittingLabel : submitLabel}
        </button>
      </form>

      {cropFile && <ImageCropModal file={cropFile} onCancel={() => setCropFile(null)} onSave={handleCropSave} />}
    </>
  );
}
