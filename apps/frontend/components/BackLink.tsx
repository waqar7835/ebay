"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useRouter } from "next/navigation";

/** Small "← Products" link shown above a form page's title, pointing back to its list page. */
export default function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      type="link"
      size="small"
      icon={<ArrowLeftOutlined />}
      onClick={() => router.push(href)}
      className="mb-1 !px-0 text-slate-500"
    >
      {label}
    </Button>
  );
}
