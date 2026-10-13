"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ProductDto } from "@ebay-order-management/shared";
import { Button, Card, Form, Input, InputNumber, Tag } from "antd";
import { useEffect } from "react";
import ProductImagesUpload, { productImageItems, type ProductImageItem } from "@/components/ProductImagesUpload";
import { setProductImages, type ProductVariationPayload } from "@/lib/api";

/** One row of the "variations" Form.List. */
export interface VariationFormValues {
  /** Set on variations that are already saved. */
  id?: string;
  sku: string;
  /** True while the SKU follows "<main SKU>-<color>-<size>"; typing in the SKU box turns it off. */
  skuAuto: boolean;
  color?: string;
  size?: string;
  stockOwnerCost?: number;
  buyPrice?: number;
  sellPrice?: number;
  stockQuantity?: number;
  images: ProductImageItem[];
}

/** "TSHIRT-RED-M": the main SKU plus the variation's color and size. */
export function suggestedSku(mainSku: string | undefined, color?: string, size?: string): string {
  return [mainSku, color, size]
    .map((v) =>
      (v ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("-");
}

type SavedVariation = Pick<
  ProductDto,
  "id" | "sku" | "color" | "size" | "stockOwnerCost" | "buyPrice" | "sellPrice" | "stockQuantity" | "imageUrls"
>;

/** Form rows for a saved product's variations (edit). */
export function variationFormValues(variations: SavedVariation[] | undefined): VariationFormValues[] {
  return (variations ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    skuAuto: false,
    color: v.color ?? "",
    size: v.size ?? "",
    stockOwnerCost: v.stockOwnerCost ?? 0,
    buyPrice: v.buyPrice ?? 0,
    sellPrice: v.sellPrice ?? 0,
    stockQuantity: v.stockQuantity,
    images: productImageItems(v.imageUrls),
  }));
}

export function variationPayloads(rows: VariationFormValues[], isStock: boolean): ProductVariationPayload[] {
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku.trim(),
    color: r.color?.trim() || undefined,
    size: r.size?.trim() || undefined,
    ...(isStock
      ? {
          stockOwnerCost: Number(r.stockOwnerCost ?? 0),
          buyPrice: Number(r.buyPrice ?? 0),
          sellPrice: Number(r.sellPrice ?? 0),
          stockQuantity: Number(r.stockQuantity ?? 0),
        }
      : {}),
  }));
}

/**
 * Saves each variation's gallery once the product is saved. `saved.variations` come back in the order they were sent,
 * so they line up with `images`. New variations without images skip the call; `always` (edits) resaves every
 * gallery so removals and reorders apply.
 */
export async function saveVariationImages(saved: ProductDto, images: Array<Array<string | File>>, always: boolean) {
  for (const [i, variation] of (saved.variations ?? []).entries()) {
    const gallery = images[i] ?? [];
    if (always || gallery.length > 0) await setProductImages(variation.id, gallery);
  }
}

/** Form.Item-friendly wrapper: Form.Item injects value / onChange. */
function VariationImages({
  value,
  onChange,
  disabled,
}: {
  value?: ProductImageItem[];
  onChange?: (items: ProductImageItem[]) => void;
  disabled?: boolean;
}) {
  return <ProductImagesUpload value={value ?? []} onChange={(items) => onChange?.(items)} disabled={disabled} />;
}

interface ProductVariationsProps {
  isStock: boolean;
  /** Currency symbol of the Stock Owner's prices. */
  pricePrefix: string;
  disabled?: boolean;
  /** Renders as an inner card (inside another card). */
  inner?: boolean;
}

/**
 * Extra variations of the product being edited (the main product's own fields are the first one): each has its own
 * color / size, SKU, images and — for Stock products — prices and stock. Must sit inside the product's <Form>, whose
 * values hold them under `variations`.
 */
export default function ProductVariations({ isStock, pricePrefix, disabled, inner }: ProductVariationsProps) {
  const form = Form.useFormInstance();
  const mainSku: string | undefined = Form.useWatch("sku", form);
  const rows: VariationFormValues[] = Form.useWatch("variations", form) ?? [];

  // Auto SKUs follow the main SKU and the row's color / size until the SKU is typed over.
  const autoKey = rows.map((r) => (r?.skuAuto ? `${r.color ?? ""}|${r.size ?? ""}|${r.sku ?? ""}` : "")).join("\n");
  useEffect(() => {
    rows.forEach((r, i) => {
      if (!r?.skuAuto) return;
      const sku = suggestedSku(mainSku, r.color, r.size);
      if (sku !== r.sku) form.setFieldValue(["variations", i, "sku"], sku);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSku, autoKey]);

  function newVariation(): VariationFormValues {
    // Starts from the main product's prices, the usual case for a new color or size.
    const main = form.getFieldsValue(["stockOwnerCost", "buyPrice", "sellPrice"]);
    return {
      sku: suggestedSku(mainSku),
      skuAuto: true,
      color: "",
      size: "",
      stockOwnerCost: main.stockOwnerCost ?? 0,
      buyPrice: main.buyPrice ?? 0,
      sellPrice: main.sellPrice ?? 0,
      stockQuantity: 0,
      images: [],
    };
  }

  return (
    <Card
      type={inner ? "inner" : undefined}
      title="Variations"
      extra={rows.length > 0 && <Tag className="mr-0">{`${rows.length + 1} variations`}</Tag>}
    >
      <p className="mb-4 mt-0 text-sm text-slate-500">
        {rows.length > 0
          ? "The product above is the first variation. Each one has its own SKU, color or size, images"
          : "Selling this product in more colors or sizes? Add a variation for each one, with its own SKU, images"}
        {isStock ? ", prices and stock." : "."}
      </p>
      <Form.List name="variations">
        {(fields, { add, remove }) => (
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => {
              const row = rows[index];
              const name = [row?.color, row?.size].filter((v) => v?.trim()).join(" / ");
              return (
                <div key={field.key} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-slate-700">
                      Variation {index + 2}
                      {name && <span className="font-normal text-slate-500"> · {name}</span>}
                    </span>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      disabled={disabled}
                      aria-label="Remove variation"
                      title="Remove variation"
                    />
                  </div>
                  <Form.Item name={[field.name, "id"]} hidden>
                    <Input />
                  </Form.Item>
                  <div className="grid gap-x-4 sm:grid-cols-3">
                    <Form.Item
                      name={[field.name, "color"]}
                      label="Color"
                      dependencies={[["variations", field.name, "size"]]}
                      rules={[
                        {
                          validator: (_, color?: string) =>
                            color?.trim() || form.getFieldValue(["variations", field.name, "size"])?.trim()
                              ? Promise.resolve()
                              : Promise.reject(new Error("Enter a color or a size")),
                        },
                      ]}
                    >
                      <Input placeholder="e.g. Red" />
                    </Form.Item>
                    <Form.Item name={[field.name, "size"]} label="Size">
                      <Input placeholder="e.g. M" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "sku"]}
                      label="SKU"
                      tooltip="Suggested from the main SKU, color and size — type to change it"
                      rules={[{ required: true, whitespace: true, message: "Enter a SKU" }]}
                    >
                      <Input onChange={() => form.setFieldValue(["variations", field.name, "skuAuto"], false)} />
                    </Form.Item>
                  </div>
                  {isStock && (
                    <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Form.Item name={[field.name, "stockOwnerCost"]} label="Stock Owner cost">
                        <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                      </Form.Item>
                      <Form.Item name={[field.name, "buyPrice"]} label="Buy price">
                        <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                      </Form.Item>
                      <Form.Item name={[field.name, "sellPrice"]} label="Sell price">
                        <InputNumber prefix={pricePrefix} min={0} step={0.01} className="w-full" />
                      </Form.Item>
                      <Form.Item name={[field.name, "stockQuantity"]} label="Stock quantity">
                        <InputNumber min={0} precision={0} className="w-full" />
                      </Form.Item>
                    </div>
                  )}
                  <Form.Item
                    name={[field.name, "images"]}
                    label="Images"
                    required={!isStock}
                    rules={
                      isStock
                        ? []
                        : [
                            {
                              validator: (_, images?: ProductImageItem[]) =>
                                images?.length ? Promise.resolve() : Promise.reject(new Error("A dropship variation needs at least one image")),
                            },
                          ]
                    }
                    className="mb-0"
                  >
                    <VariationImages disabled={disabled} />
                  </Form.Item>
                </div>
              );
            })}
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => add(newVariation())} disabled={disabled} block>
              Add variation
            </Button>
          </div>
        )}
      </Form.List>
    </Card>
  );
}
