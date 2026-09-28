"use client";

import { PlusOutlined } from "@ant-design/icons";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PRODUCT_MAX_IMAGES } from "@ebay-order-management/shared";
import { Image, Tag, Upload, type UploadFile } from "antd";
import ImgCrop from "antd-img-crop";
import { useEffect, useMemo, useState } from "react";
import { resizeToJpeg } from "@/components/ImageUpload";
import { mediaUrl } from "@/lib/api";

/** One gallery slot: either an image already saved on the product, or a newly picked file. */
export interface ProductImageItem {
  uid: string;
  /** Raw server value (as stored in ProductDto.imageUrls) for already-saved images. */
  existingUrl?: string;
  file?: File;
}

export function productImageItems(imageUrls: string[] | undefined): ProductImageItem[] {
  return (imageUrls ?? []).map((url) => ({ uid: url, existingUrl: url }));
}

// crypto.randomUUID needs a secure context (breaks on plain-http LAN hosts), so use a counter.
let nextUid = 0;

interface ProductImagesUploadProps {
  value: ProductImageItem[];
  onChange: (items: ProductImageItem[]) => void;
  disabled?: boolean;
}

/**
 * Up to PRODUCT_MAX_IMAGES product images as picture cards. Each pick goes through crop → resize,
 * cards are drag-sortable, and the first card is the cover shown everywhere the product appears.
 */
export default function ProductImagesUpload({ value, onChange, disabled }: ProductImagesUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Object URLs for newly picked files, keyed by uid; revoked when the set changes.
  const objectUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of value) if (item.file) map.set(item.uid, URL.createObjectURL(item.file));
    return map;
  }, [value]);
  useEffect(() => () => objectUrls.forEach((url) => URL.revokeObjectURL(url)), [objectUrls]);

  const fileList: UploadFile[] = value.map((item) => ({
    uid: item.uid,
    name: item.file?.name ?? "image",
    url: item.file ? objectUrls.get(item.uid) : mediaUrl(item.existingUrl),
    status: "done",
  }));

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = value.findIndex((i) => i.uid === active.id);
    const to = value.findIndex((i) => i.uid === over.id);
    onChange(arrayMove(value, from, to));
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={value.map((i) => i.uid)} strategy={horizontalListSortingStrategy}>
          <ImgCrop rotationSlider aspect={1} quality={0.85} showReset modalTitle="Adjust image">
            <Upload
              listType="picture-card"
              accept="image/*"
              disabled={disabled}
              fileList={fileList}
              beforeUpload={async (file) => {
                if (value.length < PRODUCT_MAX_IMAGES) {
                  const resized = await resizeToJpeg(file);
                  onChange([...value, { uid: `new-${nextUid++}`, file: resized }]);
                }
                return Upload.LIST_IGNORE;
              }}
              onRemove={(file) => onChange(value.filter((i) => i.uid !== file.uid))}
              onPreview={(file) => setPreviewUrl(file.url ?? null)}
              itemRender={(node, file) => (
                <SortableCard uid={file.uid} isCover={file.uid === value[0]?.uid} disabled={disabled}>
                  {node}
                </SortableCard>
              )}
            >
              {value.length < PRODUCT_MAX_IMAGES && (
                <button type="button" className="flex flex-col items-center gap-1 text-xs text-gray-500">
                  <PlusOutlined />
                  Upload
                </button>
              )}
            </Upload>
          </ImgCrop>
        </SortableContext>
      </DndContext>
      <div className="mt-1 text-xs text-gray-500">
        Up to {PRODUCT_MAX_IMAGES} images. Drag to reorder — the first image is the cover.
      </div>
      {previewUrl && (
        <Image
          className="hidden"
          src={previewUrl}
          alt=""
          preview={{ open: true, onOpenChange: (open) => !open && setPreviewUrl(null) }}
        />
      )}
    </>
  );
}

function SortableCard({
  uid,
  isCover,
  disabled,
  children,
}: {
  uid: string;
  isCover: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="relative h-full w-full"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        cursor: disabled ? undefined : "move",
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {children}
      {isCover && (
        <Tag color="blue" className="pointer-events-none absolute left-1 top-1 z-10 m-0 text-[10px] leading-4">
          Cover
        </Tag>
      )}
    </div>
  );
}
