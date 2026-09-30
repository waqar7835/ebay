"use client";

import type { OrderDto } from "@ebay-order-management/shared";
import { Space, Tag, Tooltip } from "antd";

/** True once any party (Account Holder, Stock Owner or 3PL) has been invoiced for the order — it's locked from editing. */
export function isInvoiced(order: OrderDto): boolean {
  return !!order.accountHolderInvoiceId || !!order.threePlInvoiceId || order.items.some((i) => i.stockOwnerInvoiceId);
}

/** One tag per party on the order: green once they've been invoiced for it, grey while still open. */
export default function InvoiceStatusTags({ order }: { order: OrderDto }) {
  const stockItems = order.items.filter((i) => i.stockOwnerId);
  const stockInvoiced = stockItems.filter((i) => i.stockOwnerInvoiceId).length;
  const tag = (label: string, name: string, done: boolean, partial?: string) => (
    <Tooltip title={`${name}: ${partial ?? (done ? "invoiced" : "open")}`}>
      <Tag color={done ? "green" : partial ? "gold" : "default"} className="m-0">
        {label}
      </Tag>
    </Tooltip>
  );
  return (
    <Space size={4}>
      {tag("AH", "Account Holder", !!order.accountHolderInvoiceId)}
      {stockItems.length > 0 &&
        tag(
          "SO",
          "Stock Owner",
          stockInvoiced === stockItems.length,
          stockInvoiced > 0 && stockInvoiced < stockItems.length
            ? `${stockInvoiced} of ${stockItems.length} items invoiced`
            : undefined,
        )}
      {order.threePlId && tag("3PL", "3PL", !!order.threePlInvoiceId)}
    </Space>
  );
}
