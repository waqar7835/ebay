"use client";

import { UploadOutlined } from "@ant-design/icons";
import { Button, Upload } from "antd";

interface FileUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  label?: string;
}

/** Single-file picker (receipts, shipping labels) — keeps the file locally for the parent form to submit. */
export default function FileUpload({ value, onChange, accept, label = "Select file" }: FileUploadProps) {
  return (
    <Upload
      accept={accept}
      maxCount={1}
      fileList={value ? [{ uid: "file", name: value.name, status: "done" }] : []}
      beforeUpload={(file) => {
        onChange(file);
        return Upload.LIST_IGNORE;
      }}
      onRemove={() => onChange(null)}
    >
      <Button icon={<UploadOutlined />}>{label}</Button>
    </Upload>
  );
}
