"use client";

import { PictureOutlined } from "@ant-design/icons";
import { Image } from "antd";
import { mediaUrl } from "@/lib/api";

interface ProductThumbProps {
  product?: { title: string; imageUrl: string | null; imageUrls?: string[] } | null;
  size?: number;
}

/**
 * Product cover image at a readable size, fitted whole (no cropping) inside a bordered tile.
 * Clicking opens a preview carousel of the product's full gallery.
 */
export default function ProductThumb({ product, size = 56 }: ProductThumbProps) {
  const box = { width: size, height: size };
  if (!product?.imageUrl) {
    return (
      <div style={box} className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300">
        <PictureOutlined style={{ fontSize: size * 0.4 }} />
      </div>
    );
  }
  const gallery = product.imageUrls?.length ? product.imageUrls : [product.imageUrl];
  return (
    <div style={box} className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Image.PreviewGroup items={gallery.map((url) => mediaUrl(url))}>
        <Image
          src={mediaUrl(product.imageUrl)}
          alt={product.title}
          width={size}
          height={size}
          style={{ objectFit: "contain" }}
        />
      </Image.PreviewGroup>
    </div>
  );
}
