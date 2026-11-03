"use client";

import type { ProductStockDto } from "@ebay-order-management/shared";
import { Tag, Tooltip } from "antd";

/** Red at 0 (or below), orange when running low (1–5). */
export function stockTone(qty: number): "red" | "orange" | null {
  if (qty <= 0) return "red";
  if (qty <= 5) return "orange";
  return null;
}

/** The worst tone among the 3PLs (so a 3PL running out shows on the total too), else the total's own. */
function worstTone(total: number, stocks: ProductStockDto[]): "red" | "orange" | null {
  const tones = [stockTone(total), ...stocks.map((s) => stockTone(s.quantity))];
  return tones.includes("red") ? "red" : tones.includes("orange") ? "orange" : null;
}

/** A quantity: red "Out of stock" at 0, orange "n left" when low, a plain number otherwise. */
export function StockQty({ qty }: { qty: number }) {
  const tone = stockTone(qty);
  if (tone === "red") return <Tag color="red">{`Out of stock${qty < 0 ? ` (${qty})` : ""}`}</Tag>;
  if (tone === "orange") return <Tag color="orange">{qty} left</Tag>;
  return <>{qty}</>;
}

function Breakdown({ stocks }: { stocks: ProductStockDto[] }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {stocks.map((s) => (
        <div key={s.threePlId} className="flex items-center justify-between gap-3">
          <span className="truncate">{s.threePlName || "3PL"}</span>
          <StockQty qty={s.quantity} />
        </div>
      ))}
    </div>
  );
}

/**
 * A product's total stock with its per-3PL breakdown (decided 2026-11-03): in a tooltip (`mode="tooltip"`, Admin/Staff)
 * or listed under the total (`mode="list"`, Stock Owners). Each 3PL is colored by its own quantity, and the total takes
 * the worst color of any 3PL.
 */
export default function StockLevel({
  total,
  stocks,
  mode,
}: {
  total: number;
  stocks: ProductStockDto[];
  mode: "tooltip" | "list";
}) {
  const tone = worstTone(total, stocks);
  const label = total <= 0 ? `Out of stock${total < 0 ? ` (${total})` : ""}` : String(total);
  const totalTag = tone ? (
    <Tag color={tone} className="mr-0">
      {label}
    </Tag>
  ) : (
    <span>{label}</span>
  );
  if (mode === "list") {
    return (
      <div className="flex min-w-36 flex-col items-start gap-1">
        {totalTag}
        {stocks.length > 0 && (
          <div className="self-stretch">
            <Breakdown stocks={stocks} />
          </div>
        )}
      </div>
    );
  }
  if (!stocks.length) return totalTag;
  return (
    <Tooltip title={<Breakdown stocks={stocks} />}>
      <span className="cursor-help border-b border-dashed border-slate-300">{totalTag}</span>
    </Tooltip>
  );
}
