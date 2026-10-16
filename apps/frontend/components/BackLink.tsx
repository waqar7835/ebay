"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useRouter } from "next/navigation";
import { listHref } from "@/lib/listQuery";

/**
 * A form page's title row: the page title on the left, a "Back to <list>" button aligned right. A list page returns to
 * the filters and page it was last on (`listHref`).
 */
export default function BackLink({ href, label, title }: { href: string; label: string; title: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="m-0 text-2xl font-semibold">{title}</h1>
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(listHref(href))}>
        Back to {label}
      </Button>
    </div>
  );
}
