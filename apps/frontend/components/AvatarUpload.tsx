"use client";

import { CameraOutlined, LoadingOutlined } from "@ant-design/icons";
import { Avatar, Tooltip, Upload } from "antd";
import ImgCrop from "antd-img-crop";
import { useState } from "react";
import { resizeToJpeg } from "@/components/ImageUpload";
import { mediaUrl } from "@/lib/api";

interface AvatarUploadProps {
  /** Saved picture (uploads path or absolute URL); initials are shown when there isn't one. */
  url: string | null | undefined;
  initials: string;
  size?: number;
  className?: string;
  /** Uploads the cropped picture; the avatar shows a spinner until it resolves. */
  onUpload: (file: File) => Promise<unknown>;
  onError?: (message: string) => void;
}

/** Profile picture that changes on click: pick → round crop/rotate/zoom → resized JPEG uploaded straight away. */
export default function AvatarUpload({ url, initials, size = 72, className, onUpload, onError }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);

  return (
    <ImgCrop cropShape="round" rotationSlider quality={0.85} showReset modalTitle="Adjust profile picture">
      <Upload
        accept="image/jpeg,image/png,image/webp"
        showUploadList={false}
        disabled={uploading}
        beforeUpload={async (file) => {
          setUploading(true);
          try {
            await onUpload(await resizeToJpeg(file));
          } catch (err) {
            onError?.(err instanceof Error ? err.message : "Failed to upload picture");
          } finally {
            setUploading(false);
          }
          return Upload.LIST_IGNORE;
        }}
      >
        <Tooltip title="Change picture">
          <span className="group relative inline-block shrink-0 cursor-pointer rounded-full" style={{ width: size, height: size }}>
            <Avatar size={size} src={url ? mediaUrl(url) : undefined} className={`${className ?? ""} font-semibold`}>
              {initials}
            </Avatar>
            <span
              className={`absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white transition-opacity ${
                uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              style={{ fontSize: size / 3.5 }}
            >
              {uploading ? <LoadingOutlined /> : <CameraOutlined />}
            </span>
          </span>
        </Tooltip>
      </Upload>
    </ImgCrop>
  );
}
