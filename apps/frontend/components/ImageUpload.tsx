"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Image, Upload, type UploadFile } from "antd";
import ImgCrop from "antd-img-crop";
import { useEffect, useMemo, useState } from "react";

const MAX_OUTPUT_SIZE = 800;

interface ImageUploadProps {
  /** Newly picked (already cropped) image, not yet saved. */
  value: File | null;
  /** URL of the image already saved server-side, shown until a new one is picked. */
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
  /** Lets the user change the crop aspect ratio (e.g. logos); products stay square. */
  freeAspect?: boolean;
  /** PNGs stay PNG with their transparent background (e.g. logos drawn on colored PDF headers). */
  keepTransparency?: boolean;
  uploading?: boolean;
  disabled?: boolean;
}

/** Single-image picture-card upload: pick → crop/rotate/zoom → resized JPEG (max 800px) handed to onChange. */
export default function ImageUpload({ value, existingUrl, onChange, freeAspect, keepTransparency, uploading, disabled }: ImageUploadProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const valueUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => (valueUrl ? URL.revokeObjectURL(valueUrl) : undefined), [valueUrl]);

  const shownUrl = valueUrl ?? existingUrl ?? null;
  const fileList: UploadFile[] = shownUrl
    ? [{ uid: value ? "new" : "existing", name: value?.name ?? "image", url: shownUrl, status: uploading ? "uploading" : "done" }]
    : [];

  return (
    <>
      <ImgCrop
        rotationSlider
        aspect={1}
        aspectSlider={freeAspect}
        quality={0.85}
        fillColor={keepTransparency ? "transparent" : "white"}
        showReset
        modalTitle="Adjust image"
      >
        <Upload
          listType="picture-card"
          accept={keepTransparency ? "image/png,image/jpeg" : "image/*"}
          maxCount={1}
          disabled={disabled || uploading}
          fileList={fileList}
          showUploadList={{ showRemoveIcon: !!value && !uploading }}
          beforeUpload={async (file) => {
            onChange(keepTransparency && file.type === "image/png" ? await resizeImage(file, "image/png") : await resizeToJpeg(file));
            return Upload.LIST_IGNORE;
          }}
          onRemove={() => onChange(null)}
          onPreview={() => setPreviewOpen(true)}
        >
          {!value && (
            <button type="button" className="flex flex-col items-center gap-1 text-xs text-gray-500">
              <PlusOutlined />
              {existingUrl ? "Replace" : "Upload"}
            </button>
          )}
        </Upload>
      </ImgCrop>
      {shownUrl && (
        <Image
          className="hidden"
          src={shownUrl}
          alt=""
          preview={{ open: previewOpen, onOpenChange: setPreviewOpen }}
        />
      )}
    </>
  );
}

/** Downscales the cropped image so its longest side is at most MAX_OUTPUT_SIZE and re-encodes as JPEG. */
export function resizeToJpeg(file: File): Promise<File> {
  return resizeImage(file, "image/jpeg");
}

/** Same, as JPEG (on white) or PNG (keeping transparency). */
async function resizeImage(file: File, type: "image/jpeg" | "image/png"): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, MAX_OUTPUT_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob) return file;
    const ext = type === "image/png" ? ".png" : ".jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ext, { type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
