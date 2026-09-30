"use client";

import { INVOICE_TEMPLATE_COLOR_KEYS, InvoiceLayout, type InvoiceTemplateColors } from "@ebay-order-management/shared";
import { Tooltip } from "antd";

export const LAYOUT_LABELS: Record<InvoiceLayout, { name: string; description: string }> = {
  [InvoiceLayout.CLASSIC]: { name: "Classic", description: "Logo left, large title right, filled table headers" },
  [InvoiceLayout.BANNER]: { name: "Modern Banner", description: "Full-width colored header band" },
  [InvoiceLayout.MINIMAL]: { name: "Minimal", description: "No filled boxes — hairline rules and whitespace" },
  [InvoiceLayout.EDGE]: { name: "Edge", description: "Colored side stripe, amount due shown up top" },
  [InvoiceLayout.ELEGANT]: { name: "Elegant", description: "Centered, serif headings, framed totals" },
};

export const COLOR_LABELS: Record<keyof InvoiceTemplateColors, { name: string; help: string }> = {
  background: { name: "Page background", help: "The base color of the whole page" },
  accent: { name: "Heading background", help: "Table headers, bars, section titles and the total panel" },
  headingText: { name: "Heading text", help: "Text drawn on the heading background" },
  text: { name: "Body text", help: "Regular text and figures" },
  border: { name: "Borders", help: "Borders, dividers and rules" },
};

/** The five template colors as small dots. */
export default function InvoiceTemplateSwatches({ colors }: { colors: InvoiceTemplateColors }) {
  return (
    <span className="inline-flex items-center gap-1">
      {INVOICE_TEMPLATE_COLOR_KEYS.map((key) => (
        <Tooltip key={key} title={`${COLOR_LABELS[key].name}: ${colors[key]}`}>
          <span className="inline-block h-4 w-4 rounded-full border border-slate-300" style={{ background: colors[key] }} />
        </Tooltip>
      ))}
    </span>
  );
}
