import PDFDocument from "pdfkit";
import {
  InvoiceLayout,
  InvoiceLineKind,
  InvoiceTemplateColors,
  InvoiceWatermark,
  ProductFulfillmentType,
  Role,
} from "@ebay-order-management/shared";
import {
  InvoicePdfInput,
  InvoicePdfLine,
  aggregateAccountHolderProducts,
  aggregateStockOwnerProducts,
  billingPeriod,
  currencyLabel,
  currencySymbol,
  formatDate,
  formatMoney,
  parseDateOnly,
  pct,
  round2,
  stockOwnerSplitLabel,
  sum,
  uniform,
  uniformStockOwnerSplit,
} from "./invoice-pdf";

/**
 * Draws an invoice PDF with an invoice template: one of five fixed layouts plus the template's five
 * colors and logo. The figures and wording are the same for every layout (and the same as the
 * original `invoice-pdf.ts`): the invoice is first turned into a layout-neutral content model
 * (header, parties, sections, final box), which each layout then draws in its own style.
 */
export interface TemplatedPdfInput extends Omit<InvoicePdfInput, "company"> {
  company: { name: string };
  layout: InvoiceLayout;
  colors: InvoiceTemplateColors;
  logo: Buffer | null;
  /** The template's watermark; drawn only when enabled (it then replaces the DRAFT mark). */
  watermark?: InvoiceWatermark | null;
}

type Doc = PDFKit.PDFDocument;
type Align = "left" | "right" | "center";
/** Widths are weights, scaled to the layout's content width when drawn. */
interface Column {
  header: string;
  weight: number;
  align: Align;
}

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CW = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin;
/** Sidebar layout: width of the colored column on the left. */
const SIDEBAR_WIDTH = 172;
/** Meaning-carrying colors stay fixed whatever the template: profit in green, VOID in red. */
const FIXED = { green: "#15803d", red: "#dc2626" };

export function renderTemplatedInvoicePdf(input: TemplatedPdfInput): Promise<Buffer> {
  const model =
    input.role === Role.ACCOUNT_HOLDER
      ? accountHolderModel(input)
      : input.role === Role.THREE_PL
        ? threePlModel(input)
        : stockOwnerModel(input);
  const watermark = input.watermark?.enabled && input.watermark.text.trim() ? input.watermark : null;
  return draw(model, input.layout, input.colors, input.logo, input.invoiceNumber, watermark);
}

// ---------------------------------------------------------------------------------------------
// Content model: what goes on the invoice, independent of layout.

interface Party {
  title: string;
  headline: string;
  lines: string[];
}
/** `color: "accent"` = the template's accent color. */
interface BoxRow {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  color?: string;
}
type Block =
  | { type: "section"; title: string; note?: string }
  | { type: "table"; columns: Column[]; rows: string[][]; boldLastRow?: boolean; columnColors?: Record<number, string> }
  | { type: "summary"; rows: BoxRow[] };
interface Model {
  title: string;
  subtitle: string;
  companyName: string;
  meta: [string, string][];
  parties: [Party, Party];
  blocks: Block[];
  box: { title: string; rows: BoxRow[]; totalLabel: string; totalValue: string; footnote?: [string, string] };
  footer: { thanks: string; note: string };
  status: string;
}

function columns(spec: [string, number, Align][]): Column[] {
  return spec.map(([header, weight, align]) => ({ header, weight, align }));
}

/** Amount without the currency symbol, for table cells (the currency is in the header / note). */
function plain(value: number, currency: string) {
  return formatMoney(value, currency).replace(currencySymbol(currency), "");
}

/** Header details. No status: DRAFT / VOID (or the template's own watermark) show over the page instead. */
function meta(input: TemplatedPdfInput, period: string | null): [string, string][] {
  return [
    ["Invoice #:", input.invoiceNumber],
    ["Date:", formatDate(input.date)],
    ...(period ? ([["Billing Period:", period]] as [string, string][]) : []),
  ];
}

function extrasBlocks(title: string, lines: InvoicePdfLine[], money: (v: number) => string): Block[] {
  if (!lines.length) return [];
  return [
    { type: "section", title },
    {
      type: "table",
      columns: columns([
        ["DESCRIPTION", 385, "left"],
        ["AMOUNT", 130, "right"],
      ]),
      rows: lines.map((l) => [l.description, money(l.netAmount)]),
    },
  ];
}

/** Stock Owner: what the company pays them — cost + their share of the profit. */
function stockOwnerModel(input: TemplatedPdfInput): Model {
  const cur = input.currency;
  const money = (v: number) => formatMoney(v, cur);
  const company = input.company.name;
  const name = input.partnerName;
  const orderLines = input.lines.filter((l) => l.kind === InvoiceLineKind.ORDER);
  const extraLines = input.lines.filter((l) => l.kind !== InvoiceLineKind.ORDER);
  const extrasTotal = round2(sum(extraLines.map((l) => l.netAmount)));
  const hasOrders = orderLines.length > 0;

  const blocks: Block[] = [];
  let section = 1;
  let companyShare = 0;
  let partnerShare = 0;
  let costTotal = 0;
  let split: { company: number; partner: number } | null = null;

  if (hasOrders) {
    const products = aggregateStockOwnerProducts(orderLines);
    blocks.push({ type: "section", title: `${section++}. ITEM SALES & PROFIT BREAKDOWN`, note: `Amounts in ${currencyLabel(cur)}` });
    blocks.push({
      type: "table",
      columns: columns([
        ["ITEM DESCRIPTION", 150, "left"],
        ["QTY", 36, "center"],
        ["COST/\nITEM", 58, "right"],
        ["SELL\nPRICE", 58, "right"],
        ["PROFIT/\nITEM", 58, "right"],
        ["TOTAL\nCOST", 62, "right"],
        ["TOTAL\nSALES", 62, "right"],
        ["TOTAL\nPROFIT", 62, "right"],
      ]),
      rows: products.map((p) => [
        p.title,
        String(p.quantity),
        ...[p.cost, p.price, p.price - p.cost, p.cost * p.quantity, p.price * p.quantity, (p.price - p.cost) * p.quantity].map(
          (v) => plain(v, cur),
        ),
      ]),
    });
    const units = sum(products.map((p) => p.quantity));
    const sales = round2(sum(products.map((p) => p.price * p.quantity)));
    costTotal = round2(sum(products.map((p) => p.cost * p.quantity)));
    const profit = round2(sales - costTotal);
    companyShare = round2(sum(orderLines.map((l) => l.deductionAmount)));
    partnerShare = round2(profit - companyShare);
    split = uniformStockOwnerSplit(orderLines);
    blocks.push({
      type: "summary",
      rows: [
        { label: "Total Items Sold:", value: `${units} Units` },
        { label: "Gross Sales Amount:", value: money(sales) },
        { label: "Total Original Cost (Item Cost):", value: money(costTotal) },
        { label: "Total Net Profit Generated:", value: money(profit), bold: true, color: FIXED.green },
      ],
    });
  }
  blocks.push(...extrasBlocks(`${section}. ADJUSTMENTS & MISCELLANEOUS`, extraLines, money));
  if (extraLines.length) section++;

  const rows: BoxRow[] = [];
  if (hasOrders) {
    rows.push({ label: "Total Net Profit Generated:", value: money(round2(companyShare + partnerShare)), bold: true });
    rows.push({ label: `• ${company} Profit Share${pct(split?.company)}:`, value: money(companyShare), indent: true });
    rows.push({ label: `• ${name} Profit Share${pct(split?.partner)}:`, value: money(partnerShare), indent: true });
    rows.push({ label: `Item Cost Reimbursement to ${name}:`, value: money(costTotal), bold: true });
  }
  if (extraLines.length) rows.push({ label: "Adjustments & Miscellaneous:", value: money(extrasTotal), bold: true });

  // Spell out the basis, but only when it's exactly that (uniform split, no extra lines).
  const basis = hasOrders && split && !extraLines.length ? ` (Cost + ${split.partner}% Profit)` : "";
  return {
    title: "INVOICE",
    subtitle: "Sales & Settlement Department",
    companyName: company,
    meta: meta(input, billingPeriod(orderLines)),
    parties: [
      { title: "ISSUED BY", headline: company, lines: ["Sales & Settlement Department", `Currency: ${currencyLabel(cur)}`] },
      {
        title: "BILLED TO / PARTNER",
        headline: name,
        lines: ["Stock Sales Settlement", ...(hasOrders ? [stockOwnerSplitLabel(orderLines)] : [])],
      },
    ],
    blocks,
    box: {
      title: `${section}. FINAL SETTLEMENT & PROFIT SHARING BREAKDOWN`,
      rows,
      totalLabel: `TOTAL PAYABLE TO ${name.toUpperCase()}${basis}:`,
      totalValue: money(input.totalAmount),
      footnote:
        hasOrders
          ? [`${company.toUpperCase()} NET RETENTION${pct(split?.company, " Profit Share")}:`, money(companyShare)]
          : undefined,
    },
    footer: { thanks: `Thank you for business with ${company}!`, note: "Computer Generated Official Settlement Invoice" },
    status: input.status,
  };
}

/**
 * 3PL: what the company pays the 3PL. STOCK orders earn the 3PL's fee per order; on DROPSHIP orders
 * the 3PL bought the product, so the company reimburses the buy price they entered. Each gets its own
 * section. Lines from before these details were snapshotted (no `fulfillment`) are listed as "Orders".
 */
function threePlModel(input: TemplatedPdfInput): Model {
  const cur = input.currency;
  const money = (v: number) => formatMoney(v, cur);
  const company = input.company.name;
  const name = input.partnerName;
  const orderLines = input.lines.filter((l) => l.kind === InvoiceLineKind.ORDER);
  const extraLines = input.lines.filter((l) => l.kind !== InvoiceLineKind.ORDER);
  const extrasTotal = round2(sum(extraLines.map((l) => l.netAmount)));
  const detailsOf = (l: InvoicePdfLine) => (l.details?.role === "THREE_PL" ? l.details : null);
  const groups: { title: string; amountHeader: string; totalLabel: string; lines: InvoicePdfLine[] }[] = [
    {
      title: "STOCK FULFILLMENT",
      amountHeader: "FEE",
      totalLabel: "Fulfillment Fees",
      lines: orderLines.filter((l) => detailsOf(l)?.fulfillment === ProductFulfillmentType.STOCK),
    },
    {
      title: "DROPSHIP PURCHASES",
      amountHeader: "BUY PRICE",
      totalLabel: "Dropship Reimbursement",
      lines: orderLines.filter((l) => detailsOf(l)?.fulfillment === ProductFulfillmentType.DROPSHIP),
    },
    { title: "ORDERS", amountHeader: "AMOUNT", totalLabel: "Orders", lines: orderLines.filter((l) => !detailsOf(l)?.fulfillment) },
  ].filter((g) => g.lines.length);

  const blocks: Block[] = [];
  const rows: BoxRow[] = [];
  let section = 1;
  groups.forEach((group, i) => {
    const subtotal = round2(sum(group.lines.map((l) => l.netAmount)));
    blocks.push({ type: "section", title: `${section++}. ${group.title}`, note: i === 0 ? `Amounts in ${currencyLabel(cur)}` : undefined });
    blocks.push({
      type: "table",
      columns: columns([
        ["ORDER #", 100, "left"],
        ["DATE", 72, "left"],
        ["PRODUCTS", 150, "left"],
        ["TRACKING #", 96, "left"],
        ["STATUS", 58, "left"],
        [group.amountHeader, 64, "right"],
      ]),
      rows: [
        ...group.lines.map((l) => {
          const d = detailsOf(l);
          return [
            d?.orderRef ?? l.description,
            d ? shortDate(d.orderDate) : "",
            d?.products?.map((p) => `${p.title} ×${p.quantity}`).join("\n") ?? (d ? `${d.units} unit${d.units === 1 ? "" : "s"}` : ""),
            d?.trackingNumber ?? "",
            d?.status ? statusLabel(d.status) : "",
            plain(l.netAmount, cur),
          ];
        }),
        ["SUBTOTAL", "", "", "", "", plain(subtotal, cur)],
      ],
      boldLastRow: true,
    });
    rows.push({ label: `${group.totalLabel} (${group.lines.length} order${group.lines.length === 1 ? "" : "s"}):`, value: money(subtotal), bold: true });
  });
  blocks.push(...extrasBlocks(`${section}. ADJUSTMENTS & MISCELLANEOUS`, extraLines, money));
  if (extraLines.length) {
    section++;
    rows.push({ label: "Adjustments & Miscellaneous:", value: money(extrasTotal), bold: true });
  }

  const units = sum(orderLines.map((l) => detailsOf(l)?.units ?? 0));
  return {
    title: "FULFILLMENT INVOICE",
    subtitle: "Fulfillment & Logistics",
    companyName: company,
    meta: meta(input, billingPeriod(orderLines)),
    parties: [
      { title: "ISSUED BY", headline: company, lines: ["Fulfillment & Logistics", `Currency: ${currencyLabel(cur)}`] },
      {
        title: "BILLED TO / PARTNER",
        headline: name,
        lines: [
          "3PL Fulfillment Settlement",
          ...(orderLines.length ? [`${orderLines.length} order${orderLines.length === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"}`] : []),
        ],
      },
    ],
    blocks,
    box: {
      title: `${section}. FINAL SETTLEMENT`,
      rows,
      totalLabel: `TOTAL PAYABLE TO ${name.toUpperCase()}:`,
      totalValue: money(input.totalAmount),
    },
    footer: { thanks: `Thank you for business with ${company}!`, note: "Computer Generated Official Fulfillment Invoice" },
    status: input.status,
  };
}

/** "2026-09-12" → "Sep 12, 2026", with non-breaking spaces so a date never wraps. */
function shortDate(value: string) {
  return parseDateOnly(value)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .replace(/ /g, "\u00a0");
}

/** "DELIVERED" → "Delivered". */
function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** Account Holder: what the Account Holder pays the company (they hold the eBay proceeds). */
function accountHolderModel(input: TemplatedPdfInput): Model {
  const cur = input.currency;
  const money = (v: number) => formatMoney(v, cur);
  const symbol = currencySymbol(cur).trim();
  const company = input.company.name;
  const orderLines = input.lines.filter((l) => l.kind === InvoiceLineKind.ORDER);
  const extraLines = input.lines.filter((l) => l.kind !== InvoiceLineKind.ORDER);
  const extrasTotal = round2(sum(extraLines.map((l) => l.netAmount)));
  const hasOrders = orderLines.length > 0;

  const products = aggregateAccountHolderProducts(orderLines);
  const totals = {
    quantity: sum(products.map((p) => p.quantity)),
    selling: round2(sum(products.map((p) => p.selling))),
    buying: round2(sum(products.map((p) => p.buying))),
    threePl: round2(sum(products.map((p) => p.threePl))),
    shipping: round2(sum(products.map((p) => p.shipping))),
  };
  const profit = round2(totals.selling - totals.buying - totals.threePl - totals.shipping);
  const sharePercent = uniform(
    orderLines.map((l) => (l.details?.role === "ACCOUNT_HOLDER" ? l.details.companySharePercent : null)),
  );

  const blocks: Block[] = [];
  let section = 1;
  if (hasOrders) {
    // The Shipping column only appears when a label was bought outside eBay on one of the orders.
    const withShipping = totals.shipping !== 0;
    const cols = columns([
      ["SOURCE", 150, "left"],
      ["QTY", 38, "center"],
      [`SELLING (${symbol})`, 70, "right"],
      [`BUYING (${symbol})`, 70, "right"],
      [`3PL (${symbol})`, 60, "right"],
      ...(withShipping ? ([[`SHIPPING (${symbol})`, 76, "right"]] as [string, number, Align][]) : []),
      [`PROFIT (${symbol})`, 68, "right"],
    ]);
    const row = (title: string, r: Omit<(typeof products)[number], "title">, rowProfit: number) => [
      title,
      String(r.quantity),
      ...[r.selling, r.buying, r.threePl, ...(withShipping ? [r.shipping] : []), rowProfit].map((v) => plain(v, cur)),
    ];
    blocks.push({ type: "section", title: `${section++}. PRODUCT BREAKDOWN` });
    blocks.push({
      type: "table",
      columns: cols,
      rows: [
        ...products.map((p) => row(p.title, p, p.selling - p.buying - p.threePl - p.shipping)),
        row("TOTAL SUMMARY", totals, profit),
      ],
      boldLastRow: true,
      columnColors: { [cols.length - 1]: FIXED.green },
    });
  }
  blocks.push(...extrasBlocks(`${section}. ADJUSTMENTS & OTHER CHARGES`, extraLines, money));
  if (extraLines.length) section++;

  // What the company is owed: its profit share + reimbursements (+ adjustments).
  const orderDue = round2(sum(orderLines.map((l) => l.netAmount)));
  const companyShare = round2(orderDue - totals.buying - totals.threePl - totals.shipping);
  const withCur = (v: number) => `${money(v)} ${cur}`;
  const rows: BoxRow[] = [
    ...(hasOrders
      ? [
          { label: "Total Generated Net Profit:", value: withCur(profit), bold: true },
          { label: `${company} Profit Share Due${pct(sharePercent)}:`, value: withCur(companyShare), color: "accent" },
          { label: "Buying Price Reimbursement:", value: withCur(totals.buying) },
          { label: "3PL Warehouse Charges Reimbursement:", value: withCur(totals.threePl) },
          // Only labels bought outside eBay; eBay-bought labels are already out of the payout.
          ...(totals.shipping ? [{ label: "Shipping Label Reimbursement:", value: withCur(totals.shipping) }] : []),
        ]
      : []),
    ...(extraLines.length ? [{ label: "Adjustments & Other Charges:", value: withCur(extrasTotal) }] : []),
  ];

  return {
    title: "ACCOUNT INVOICE",
    subtitle: "E-Commerce Management",
    companyName: company,
    meta: meta(input, billingPeriod(orderLines)),
    parties: [
      {
        title: "BILLED TO",
        headline: input.partnerName,
        lines: ["Marketplace Account Statement", `Currency: ${currencyLabel(cur)}`],
      },
      {
        title: "FROM",
        headline: company,
        lines: [
          "Operations & Management",
          ...(sharePercent !== null ? [`Profit share: ${sharePercent}% company / ${round2(100 - sharePercent)}% you`] : []),
        ],
      },
    ],
    blocks,
    box: {
      title: `${section}. FINAL PAYABLE BREAKDOWN (PROFIT SHARE & REIMBURSEMENTS)`,
      rows,
      totalLabel: "TOTAL AMOUNT PAYABLE BY CLIENT:",
      totalValue: withCur(input.totalAmount),
    },
    footer: {
      thanks: company.toUpperCase(),
      note: `${company} Operations & Management • Official Invoice Generated for ${input.partnerName}`,
    },
    status: input.status,
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing. Each layout draws the same content model in its own style; the switch statements below
// are where the layouts differ.

interface Ctx {
  doc: Doc;
  t: InvoiceTemplateColors;
  layout: InvoiceLayout;
  logo: Buffer | null;
  /** Left edge and width of the content area (narrower beside the Sidebar layout's column). */
  x0: number;
  cw: number;
  /** Secondary text / labels. */
  muted: string;
  faint: string;
  /** Light accent washes for zebra rows, table headers and the total row. */
  tint: string;
  tint2: string;
  /** Card surface for the Soft Cards layout (the page background lifted toward white). */
  card: string;
}

function draw(
  model: Model,
  layout: InvoiceLayout,
  colors: InvoiceTemplateColors,
  logo: Buffer | null,
  number: string,
  custom: InvoiceWatermark | null,
) {
  const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true, info: { Title: `Invoice ${number}` } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const sidebar = layout === InvoiceLayout.SIDEBAR;
  const x0 = sidebar ? SIDEBAR_WIDTH + 28 : PAGE.margin;
  const ctx: Ctx = {
    doc,
    t: colors,
    layout,
    logo: usableLogo(logo),
    x0,
    cw: sidebar ? PAGE.width - x0 - 36 : CW,
    muted: mix(colors.text, colors.background, 0.38),
    faint: mix(colors.text, colors.background, 0.6),
    tint: mix(colors.accent, colors.background, 0.94),
    tint2: mix(colors.accent, colors.background, 0.88),
    card: mix(colors.background, "#ffffff", 0.75),
  };
  pageDecor(ctx, true);
  doc.on("pageAdded", () => pageDecor(ctx, false));

  let y = header(ctx, model);
  y = parties(ctx, model, y);
  for (const block of model.blocks) {
    if (block.type === "section") y = sectionTitle(ctx, block.title, y, block.note);
    else if (block.type === "table") y = table(ctx, block, y) + 8;
    else y = summary(ctx, block.rows, y + 6) + 10;
  }
  y = totalBox(ctx, model, y + 12);
  footer(ctx, model, y + 14);
  if (custom) customWatermark(ctx, custom);
  watermark(ctx, model.status, !!custom);
  doc.end();
  return done;
}

/** Background and the layout's page furniture, on every page. */
function pageDecor(ctx: Ctx, first: boolean) {
  const { doc, t, layout } = ctx;
  const W = PAGE.width;
  doc.rect(0, 0, W, PAGE.height).fill(t.background);
  if (layout === InvoiceLayout.SIDEBAR) doc.rect(0, 0, SIDEBAR_WIDTH, PAGE.height).fill(t.accent);
  if (layout === InvoiceLayout.SPLIT && !first) doc.rect(0, 0, W, 6).fill(t.accent);
  if (layout === InvoiceLayout.BOLD) {
    // An angled block in the top-right corner (smaller on continuation pages).
    if (first) doc.polygon([W - 210, 0], [W, 0], [W, 170], [W - 120, 170]).fill(t.accent);
    else doc.polygon([W - 120, 0], [W, 0], [W, 22], [W - 100, 22]).fill(t.accent);
  }
}

// ----- Header

function header(ctx: Ctx, m: Model): number {
  switch (ctx.layout) {
    case InvoiceLayout.SPLIT:
      return splitHeader(ctx, m);
    case InvoiceLayout.SIDEBAR:
      return sidebarHeader(ctx, m);
    case InvoiceLayout.CARDS:
      return cardsHeader(ctx, m);
    case InvoiceLayout.BOLD:
      return boldHeader(ctx, m);
    default:
      return classicHeader(ctx, m);
  }
}

function classicHeader(ctx: Ctx, m: Model) {
  const { doc, t } = ctx;
  const x = PAGE.margin;
  const top = PAGE.margin;
  logoAt(ctx, x, top, 80, 64);
  doc.font("Helvetica-Bold").fontSize(28).fillColor(t.accent).text(m.title, x, top - 2, { width: CW, align: "right" });
  let my = top + 36;
  for (const [label, value] of m.meta) {
    metaRight(doc, label, value, my, ctx.muted, t.text, 9.5);
    my += 13;
  }
  const y = Math.max(my, top + 68) + 4;
  doc.rect(x, y, CW, 2.5).fill(t.border);
  return y + 22;
}

/** Solid accent block (logo, company, title) beside a tinted block with the details in a grid. */
function splitHeader(ctx: Ctx, m: Model) {
  const { doc, t } = ctx;
  const height = 150;
  const splitX = PAGE.width * 0.56;
  const soft = mix(t.headingText, t.accent, 0.28);
  doc.rect(0, 0, splitX, height).fill(t.accent);
  doc.rect(splitX, 0, PAGE.width - splitX, height).fill(ctx.tint2);

  const lx = PAGE.margin;
  let tx = lx;
  if (ctx.logo) {
    doc.roundedRect(lx, 30, 56, 56, 10).fill(t.background);
    logoAt(ctx, lx + 7, 37, 42, 42, "center");
    tx = lx + 70;
  }
  doc.font("Helvetica-Bold").fontSize(14).fillColor(t.headingText).text(m.companyName, tx, 40, { width: splitX - tx - 20, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8.5).fillColor(soft).text(m.subtitle, tx, 60, { width: splitX - tx - 20, lineBreak: false, ellipsis: true });
  const size = fitSize(doc, "Helvetica-Bold", m.title, splitX - lx - 30, 26, 16);
  doc.font("Helvetica-Bold").fontSize(size).fillColor(t.headingText).text(m.title, lx, 104, { width: splitX - lx - 20, lineBreak: false, characterSpacing: 0.5 });

  detailGrid(ctx, m.meta, splitX + 28, 30, PAGE.width - PAGE.margin - splitX - 28, 1, ctx.muted, t.text, 10);
  return height + 26;
}

/** Everything but the tables lives in the colored column: logo, details, parties and the amount due. */
function sidebarHeader(ctx: Ctx, m: Model) {
  const { doc, t } = ctx;
  const pad = 24;
  const w = SIDEBAR_WIDTH - pad * 2;
  const soft = mix(t.headingText, t.accent, 0.32);
  let sy = 34;
  if (ctx.logo) {
    doc.roundedRect(pad, sy, 60, 60, 10).fill(t.background);
    logoAt(ctx, pad + 6, sy + 6, 48, 48, "center");
    sy += 76;
  }
  sy = textBlock(doc, m.companyName, pad, sy, w, "Helvetica-Bold", 13, t.headingText) + 3;
  sy = textBlock(doc, m.subtitle, pad, sy, w, "Helvetica", 8.5, soft) + 22;

  for (const [label, value] of m.meta) {
    sy = textBlock(doc, label.replace(":", "").toUpperCase(), pad, sy, w, "Helvetica-Bold", 7, soft, 1) + 3;
    sy = textBlock(doc, value, pad, sy, w, "Helvetica-Bold", 9.5, t.headingText) + 11;
  }
  hr(doc, pad, sy + 4, w, soft, 0.5);
  sy += 20;
  for (const p of m.parties) {
    sy = textBlock(doc, p.title, pad, sy, w, "Helvetica-Bold", 7, soft, 1) + 4;
    sy = textBlock(doc, p.headline, pad, sy, w, "Helvetica-Bold", 11, t.headingText) + 3;
    for (const line of p.lines) sy = textBlock(doc, line, pad, sy, w, "Helvetica", 8.5, soft) + 2;
    sy += 16;
  }

  // The amount due anchors the bottom of the column.
  const label = m.box.totalLabel.replace(/:$/, "");
  const valueSize = fitSize(doc, "Helvetica-Bold", m.box.totalValue, w, 20);
  doc.font("Helvetica-Bold").fontSize(7).fillColor(soft);
  const labelH = doc.heightOfString(label, { width: w, characterSpacing: 1 });
  const ty = Math.max(sy + 6, PAGE.height - 60 - labelH - valueSize - 20);
  hr(doc, pad, ty, w, soft, 0.5);
  doc.text(label, pad, ty + 14, { width: w, characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(valueSize).fillColor(t.headingText).text(m.box.totalValue, pad, ty + 20 + labelH, { width: w, lineBreak: false });

  // Main column: the title.
  const { x0, cw } = ctx;
  const size = fitSize(doc, "Helvetica-Bold", m.title, cw, 24, 16);
  doc.font("Helvetica-Bold").fontSize(size).fillColor(t.text).text(m.title, x0, 44, { width: cw, lineBreak: false, characterSpacing: 0.5 });
  doc.font("Helvetica").fontSize(9).fillColor(ctx.muted).text(`${m.companyName} · ${m.subtitle}`, x0, 50 + size, { width: cw, lineBreak: false, ellipsis: true });
  hr(doc, x0, 74 + size, cw, t.border, 1);
  return 98 + size;
}

/** A rounded accent hero card (title + amount due), then a row of detail tiles. */
function cardsHeader(ctx: Ctx, m: Model) {
  const { doc, t, x0, cw } = ctx;
  const top = 36;
  const h = 118;
  const soft = mix(t.headingText, t.accent, 0.25);
  doc.roundedRect(x0, top, cw, h, 14).fill(t.accent);
  let tx = x0 + 24;
  if (ctx.logo) {
    doc.roundedRect(x0 + 22, top + 27, 64, 64, 12).fill(ctx.card);
    logoAt(ctx, x0 + 30, top + 35, 48, 48, "center");
    tx = x0 + 104;
  }
  const rightW = 190;
  const rx = x0 + cw - 24 - rightW;
  const leftW = rx - tx - 16;
  const titleSize = fitSize(doc, "Helvetica-Bold", m.title, leftW, 22, 14);
  doc.font("Helvetica-Bold").fontSize(titleSize).fillColor(t.headingText).text(m.title, tx, top + 34, { width: leftW, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(t.headingText).text(m.companyName, tx, top + 64, { width: leftW, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8.5).fillColor(soft).text(m.subtitle, tx, top + 79, { width: leftW, lineBreak: false, ellipsis: true });

  const label = m.box.totalLabel.replace(/:$/, "");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(soft);
  const labelH = Math.min(doc.heightOfString(label, { width: rightW, characterSpacing: 0.8 }), 20);
  doc.text(label, rx, top + 34, { width: rightW, align: "right", characterSpacing: 0.8, height: 20 });
  const valueSize = fitSize(doc, "Helvetica-Bold", m.box.totalValue, rightW, 24);
  doc.font("Helvetica-Bold").fontSize(valueSize).fillColor(t.headingText).text(m.box.totalValue, rx, top + 42 + labelH, { width: rightW, align: "right", lineBreak: false });

  // Detail tiles.
  const y = top + h + 14;
  const gap = 10;
  const n = m.meta.length;
  const tw = (cw - gap * (n - 1)) / n;
  m.meta.forEach(([l, v], i) => {
    const x = x0 + i * (tw + gap);
    doc.roundedRect(x, y, tw, 50, 10).lineWidth(0.75).fillAndStroke(ctx.card, t.border);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(ctx.muted).text(l.replace(":", "").toUpperCase(), x + 14, y + 12, { width: tw - 28, characterSpacing: 0.8, lineBreak: false });
    const size = fitSize(doc, "Helvetica-Bold", v, tw - 28, 10.5, 8);
    doc.font("Helvetica-Bold").fontSize(size).fillColor(t.text).text(v, x + 14, y + 26, { width: tw - 28, lineBreak: false, ellipsis: true });
  });
  return y + 50 + 22;
}

/** Oversized title, an angled accent block holding the logo, details in a row, thick rules. */
function boldHeader(ctx: Ctx, m: Model) {
  const { doc, t, x0, cw } = ctx;
  const W = PAGE.width;
  if (ctx.logo) {
    doc.roundedRect(W - PAGE.margin - 64, 44, 64, 64, 10).fill(t.background);
    logoAt(ctx, W - PAGE.margin - 57, 51, 50, 50, "center");
  }
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(ctx.muted).text(m.companyName.toUpperCase(), x0, 44, { width: W - 230 - x0, characterSpacing: 2, lineBreak: false, ellipsis: true });
  const size = fitSize(doc, "Helvetica-Bold", m.title, W - 240 - x0, 44, 22);
  doc.font("Helvetica-Bold").fontSize(size).fillColor(t.text).text(m.title, x0, 60, { width: W - 230 - x0, lineBreak: false, characterSpacing: -0.5 });
  doc.rect(x0, 60 + size + 8, 56, 5).fill(t.accent);

  let y = Math.max(60 + size + 40, 190);
  y = detailGrid(ctx, m.meta, x0, y, cw, m.meta.length, t.accent, t.text);
  hr(doc, x0, y + 12, cw, t.border, 2);
  return y + 34;
}

/**
 * Details as a grid of label-over-value cells (never a single overflowing line). Returns the bottom
 * of the grid.
 */
function detailGrid(
  ctx: Ctx,
  meta: [string, string][],
  x: number,
  y: number,
  width: number,
  cols: number,
  labelColor: string,
  valueColor: string,
  rowGap = 14,
) {
  const { doc } = ctx;
  const cellW = width / cols;
  let rowTop = y;
  let bottom = y;
  meta.forEach(([label, value], i) => {
    const col = i % cols;
    if (col === 0 && i > 0) rowTop = bottom + rowGap;
    const cx = x + col * cellW;
    const ly = textBlock(doc, label.replace(":", "").toUpperCase(), cx, rowTop, cellW - 12, "Helvetica-Bold", 7, labelColor, 1);
    bottom = Math.max(bottom, textBlock(doc, value, cx, ly + 4, cellW - 12, "Helvetica-Bold", 10, valueColor));
  });
  return bottom;
}

// ----- Billed to / from

function parties(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, layout, x0, cw } = ctx;
  if (layout === InvoiceLayout.SIDEBAR) return y; // Drawn in the sidebar.

  const pad = layout === InvoiceLayout.BOLD ? 0 : 18;
  const n = Math.max(...m.parties.map((p) => p.lines.length));
  // label, then headline, then the lines — the box always clears the last line by `pad`.
  const contentH = 36 + n * 13 - 2;
  const h = contentH + pad * 2;
  const gap = 20;
  const w = (cw - gap) / 2;

  if (layout === InvoiceLayout.SPLIT) {
    doc.roundedRect(x0, y, cw, h, 8).lineWidth(1).stroke(t.border);
    doc.moveTo(x0 + cw / 2, y + 14).lineTo(x0 + cw / 2, y + h - 14).lineWidth(1).strokeColor(t.border).stroke();
  }
  m.parties.forEach((p, i) => {
    const x = x0 + i * (w + gap);
    let tx = x + pad;
    if (layout === InvoiceLayout.CLASSIC) {
      doc.roundedRect(x, y, w, h, 5).fill(ctx.tint);
      doc.rect(x, y, 3, h).fill(t.border);
    } else if (layout === InvoiceLayout.CARDS) {
      doc.roundedRect(x, y, w, h, 12).lineWidth(0.75).fillAndStroke(ctx.card, t.border);
    } else if (layout === InvoiceLayout.BOLD) {
      doc.rect(x, y, 4, h).fill(t.accent);
      tx = x + 16;
    }
    const textW = w - (tx - x) - 16;
    const ty = y + pad;
    const labelColor = layout === InvoiceLayout.BOLD ? ctx.muted : t.accent;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(labelColor).text(p.title, tx, ty, { width: textW, characterSpacing: 1.2, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(t.text).text(p.headline, tx, ty + 15, { width: textW, lineBreak: false, ellipsis: true });
    p.lines.forEach((line, li) => {
      doc.font("Helvetica").fontSize(9).fillColor(ctx.muted).text(line, tx, ty + 36 + li * 13, { width: textW, lineBreak: false, ellipsis: true });
    });
  });
  return y + h + (layout === InvoiceLayout.BOLD ? 30 : 24);
}

// ----- Section titles

function sectionTitle(ctx: Ctx, title: string, y: number, note?: string): number {
  const { doc, t, layout, x0, cw } = ctx;
  const bare = title.replace(/^\d+\.\s*/, "");
  y = ensureSpace(doc, y + 8, 90);
  let noteW = 0;
  if (note) {
    doc.font("Helvetica").fontSize(8).fillColor(ctx.muted);
    noteW = doc.widthOfString(note) + 12;
    doc.text(note, x0, y + (layout === InvoiceLayout.BOLD ? 6 : 2), { width: cw, align: "right" });
  }
  switch (layout) {
    case InvoiceLayout.SPLIT: {
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(t.accent).text(bare, x0, y, { lineBreak: false, characterSpacing: 0.8 });
      const end = x0 + doc.widthOfString(bare, { characterSpacing: 0.8 }) + 12;
      const lineEnd = x0 + cw - noteW;
      if (lineEnd > end) hr(doc, end, y + 5.5, lineEnd - end, t.border, 1);
      return y + 24;
    }
    case InvoiceLayout.SIDEBAR:
      doc.rect(x0, y + 2, 6, 6).fill(t.accent);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(t.accent).text(bare, x0 + 14, y, { width: cw - 14 - noteW, characterSpacing: 1, lineBreak: false });
      return y + 22;
    case InvoiceLayout.CARDS: {
      doc.font("Helvetica-Bold").fontSize(8);
      const w = doc.widthOfString(bare) + bare.length + 26;
      doc.roundedRect(x0, y - 2, w, 20, 10).fill(t.accent);
      doc.fillColor(t.headingText).text(bare, x0 + 13, y + 4.5, { characterSpacing: 1, lineBreak: false });
      return y + 30;
    }
    case InvoiceLayout.BOLD: {
      const num = String(parseInt(title, 10) || 0).padStart(2, "0");
      doc.font("Helvetica-Bold").fontSize(18).fillColor(t.accent).text(num, x0, y, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(t.text).text(bare, x0 + 34, y + 4, { width: cw - 34 - noteW, lineBreak: false, ellipsis: true });
      return y + 32;
    }
    default:
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(t.accent).text(title, x0, y, { width: cw - noteW, characterSpacing: 0.3 });
      hr(doc, x0, y + 19, cw, t.border, 1);
      return y + 29;
  }
}

// ----- Tables

interface TableStyle {
  headerFill: string | null;
  headerText: string;
  radius: number;
  /** Alternate-row wash, or every row's fill (Soft Cards). */
  zebra: string | null;
  rowFill: string | null;
  rule: string | null;
  /** Thick rules above and below the header (Bold) / accent underline (Sidebar). */
  headerRules: { above: number; below: number; color: string } | null;
}

function tableStyle(ctx: Ctx): TableStyle {
  const { t } = ctx;
  switch (ctx.layout) {
    case InvoiceLayout.SPLIT:
      return { headerFill: t.accent, headerText: t.headingText, radius: 5, zebra: ctx.tint, rowFill: null, rule: null, headerRules: null };
    case InvoiceLayout.SIDEBAR:
      return { headerFill: null, headerText: t.accent, radius: 0, zebra: null, rowFill: null, rule: t.border, headerRules: { above: 0, below: 1.25, color: t.accent } };
    case InvoiceLayout.CARDS:
      return { headerFill: ctx.tint2, headerText: t.accent, radius: 8, zebra: null, rowFill: ctx.card, rule: t.border, headerRules: null };
    case InvoiceLayout.BOLD:
      return { headerFill: null, headerText: t.text, radius: 0, zebra: null, rowFill: null, rule: mix(t.border, t.background, 0.85), headerRules: { above: 2, below: 1, color: t.border } };
    default:
      return { headerFill: t.accent, headerText: t.headingText, radius: 0, zebra: ctx.tint, rowFill: null, rule: t.border, headerRules: null };
  }
}

function table(
  ctx: Ctx,
  opts: { columns: Column[]; rows: string[][]; boldLastRow?: boolean; columnColors?: Record<number, string> },
  y: number,
): number {
  const { doc, t, x0, cw } = ctx;
  const style = tableStyle(ctx);
  const narrow = ctx.layout === InvoiceLayout.SIDEBAR;
  let pad = narrow ? 6 : 8;
  let bodySize = narrow ? 8 : 9;
  let headSize = narrow ? 7 : 8;
  const totalWeight = sum(opts.columns.map((c) => c.weight));
  const widths = () => opts.columns.map((c) => ({ ...c, width: (c.weight / totalWeight) * cw }));
  let cols = widths();
  // A wide table (e.g. 3PL orders beside the Sidebar) steps down a little rather than break words.
  while (!fitColumns(doc, cols, opts.rows, { headSize, bodySize, pad, boldLastRow: !!opts.boldLastRow }) && bodySize > 7) {
    bodySize -= 0.5;
    headSize -= 0.5;
    pad = 5;
    cols = widths();
  }
  const rows = opts.rows;

  const drawHeader = (hy: number) => {
    doc.font("Helvetica-Bold").fontSize(headSize);
    const height = Math.max(...cols.map((c) => doc.heightOfString(c.header, { width: c.width - pad * 2 }))) + (style.headerFill ? 14 : 12);
    if (style.headerRules?.above) hr(doc, x0, hy, cw, style.headerRules.color, style.headerRules.above);
    if (style.headerFill) {
      if (style.radius) doc.roundedRect(x0, hy, cw, height, style.radius).fill(style.headerFill);
      else doc.rect(x0, hy, cw, height).fill(style.headerFill);
    }
    let x = x0;
    for (const c of cols) {
      const h = doc.heightOfString(c.header, { width: c.width - pad * 2 });
      doc.fillColor(style.headerText).text(c.header, x + pad, hy + (height - h) / 2, { width: c.width - pad * 2, align: c.align, characterSpacing: 0.4 });
      x += c.width;
    }
    if (style.headerRules?.below) hr(doc, x0, hy + height, cw, style.headerRules.color, style.headerRules.below);
    return hy + height + (style.radius ? 2 : 0);
  };

  y = ensureSpace(doc, y, 60);
  y = drawHeader(y);
  rows.forEach((row, r) => {
    const last = opts.boldLastRow && r === rows.length - 1;
    const font = (i: number) => (last || i === 0 ? "Helvetica-Bold" : "Helvetica");
    const heights = row.map((cell, i) => doc.font(font(i)).fontSize(bodySize).heightOfString(cell, { width: cols[i].width - pad * 2 }));
    const height = Math.max(...heights) + (narrow ? 11 : 12);
    if (y + height > BOTTOM) {
      doc.addPage();
      y = drawHeader(PAGE.margin + (ctx.layout === InvoiceLayout.SPLIT ? 6 : 0));
    }
    if (style.rowFill) doc.rect(x0, y, cw, height).fill(style.rowFill);
    if (last && ctx.layout !== InvoiceLayout.BOLD) doc.rect(x0, y, cw, height).fill(ctx.tint2);
    else if (style.zebra && r % 2 === 1) doc.rect(x0, y, cw, height).fill(style.zebra);
    if (last && ctx.layout === InvoiceLayout.BOLD) hr(doc, x0, y, cw, t.border, 1.5);
    let x = x0;
    row.forEach((cell, i) => {
      const c = cols[i];
      doc
        .font(font(i))
        .fontSize(bodySize)
        .fillColor(opts.columnColors?.[i] ?? t.text)
        .text(cell, x + pad, y + (height - heights[i]) / 2, { width: c.width - pad * 2, align: c.align });
      x += c.width;
    });
    if (style.rule) hr(doc, x0, y + height, cw, style.rule, 0.5);
    y += height;
  });
  return y;
}

/**
 * Widens any column narrower than its longest word (header or cell) — so order numbers, tracking
 * numbers and statuses never break mid-word — taking the space from columns with room to spare.
 */
function fitColumns(
  doc: Doc,
  cols: { header: string; width: number }[],
  rows: string[][],
  o: { headSize: number; bodySize: number; pad: number; boldLastRow: boolean },
): boolean {
  const longestWord = (text: string, font: string, size: number, spacing = 0) =>
    // Only breakable whitespace — `\s` would also split on the non-breaking spaces that keep dates whole.
    Math.max(0, ...text.split(/[ \t\n]+/).map((w) => doc.font(font).fontSize(size).widthOfString(w, { characterSpacing: spacing })));
  const needed = cols.map((c, i) => {
    const cells = rows.map((row, r) => {
      const bold = i === 0 || (o.boldLastRow && r === rows.length - 1);
      return longestWord(row[i] ?? "", bold ? "Helvetica-Bold" : "Helvetica", o.bodySize);
    });
    return Math.max(longestWord(c.header, "Helvetica-Bold", o.headSize, 0.4), ...cells) + o.pad * 2 + 1;
  });
  const deficit = sum(cols.map((c, i) => Math.max(0, needed[i] - c.width)));
  const slack = sum(cols.map((c, i) => Math.max(0, c.width - needed[i])));
  if (!deficit) return true;
  if (slack < deficit) return false; // No room: the caller may shrink the text, else it wraps.
  const give = cols.map((c, i) => Math.max(0, c.width - needed[i]));
  cols.forEach((c, i) => {
    c.width = c.width < needed[i] ? needed[i] : c.width - (give[i] / slack) * deficit;
  });
  return true;
}

function summary(ctx: Ctx, rows: BoxRow[], y: number): number {
  const { doc, t, x0, cw } = ctx;
  y = ensureSpace(doc, y, rows.length * 16);
  const valueX = x0 + cw - 130;
  for (const r of rows) {
    doc
      .font(r.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9.5)
      .fillColor(r.bold ? t.text : ctx.muted)
      .text(r.label, x0, y, { width: valueX - x0 - 20, align: "right" });
    doc.font("Helvetica-Bold").fillColor(rowColor(ctx, r)).text(r.value, valueX, y, { width: 122, align: "right" });
    y += 16;
  }
  return y;
}

// ----- Final settlement / payable

/** Breakdown rows with wrapped labels; returns each row's height. */
function rowHeights(ctx: Ctx, rows: BoxRow[], labelWidth: number) {
  return rows.map((r) =>
    Math.max(17, ctx.doc.font(r.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(r.label, { width: labelWidth - (r.indent ? 10 : 0) }) + 6),
  );
}

function drawRows(ctx: Ctx, rows: BoxRow[], heights: number[], x: number, y: number, width: number, labelWidth: number) {
  const { doc, t } = ctx;
  rows.forEach((r, i) => {
    doc
      .font(r.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor(r.bold ? t.text : ctx.muted)
      .text(r.label, x + (r.indent ? 10 : 0), y, { width: labelWidth - (r.indent ? 10 : 0) });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(rowColor(ctx, r)).text(r.value, x, y, { width, align: "right" });
    y += heights[i];
  });
  return y;
}

function drawFootnote(ctx: Ctx, footnote: [string, string], x: number, y: number, width: number) {
  const { doc, t } = ctx;
  hr(doc, x, y + 2, width, t.border, 0.5);
  doc.font("Helvetica").fontSize(8).fillColor(ctx.muted).text(footnote[0], x, y + 10, { width: width - 70, lineBreak: false, ellipsis: true });
  doc.text(footnote[1], x, y + 10, { width, align: "right" });
}

function totalBox(ctx: Ctx, m: Model, y: number): number {
  switch (ctx.layout) {
    case InvoiceLayout.SPLIT:
      return barTotal(ctx, m, y);
    case InvoiceLayout.SIDEBAR:
      return ruledTotal(ctx, m, y);
    case InvoiceLayout.BOLD:
      return statementTotal(ctx, m, y);
    default:
      return panelTotal(ctx, m, y);
  }
}

/** Classic / Soft Cards: rows on the left, the amount due in a solid panel on the right. */
function panelTotal(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, x0, cw, layout } = ctx;
  const b = m.box;
  const cards = layout === InvoiceLayout.CARDS;
  const inset = 20;
  const inner = cw - inset * 2;
  const panelW = 170;
  const rowsW = inner - panelW - 22;
  const heights = rowHeights(ctx, b.rows, rowsW - 76);
  const rowsH = sum(heights) + (b.footnote ? 26 : 0);
  const height = 38 + Math.max(rowsH, 90) + 14;
  y = ensureSpace(doc, y, height + 10);
  if (cards) doc.roundedRect(x0, y, cw, height, 14).lineWidth(0.75).fillAndStroke(ctx.card, t.border);
  else doc.roundedRect(x0, y, cw, height, 6).lineWidth(1).fillAndStroke(ctx.tint, t.border);

  const title = cards ? b.title.replace(/^\d+\.\s*/, "") : b.title;
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(t.accent).text(title, x0 + inset, y + 16, { width: inner, characterSpacing: 0.4, lineBreak: false, ellipsis: true });
  const cy = drawRows(ctx, b.rows, heights, x0 + inset, y + 38, rowsW, rowsW - 76);
  if (b.footnote) drawFootnote(ctx, b.footnote, x0 + inset, cy, rowsW);

  const px = x0 + inset + rowsW + 22;
  const py = y + 38;
  const ph = height - 38 - 14;
  doc.roundedRect(px, py, panelW, ph, cards ? 12 : 6).fill(t.accent);
  const label = b.totalLabel.replace(/:$/, "");
  const valueSize = fitSize(doc, "Helvetica-Bold", b.totalValue, panelW - 32, 22);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(mix(t.headingText, t.accent, 0.2));
  const labelH = doc.heightOfString(label, { width: panelW - 32, characterSpacing: 0.8 });
  const top = py + (ph - (labelH + 8 + valueSize)) / 2;
  doc.text(label, px + 16, top, { width: panelW - 32, characterSpacing: 0.8 });
  doc.font("Helvetica-Bold").fontSize(valueSize).fillColor(t.headingText).text(b.totalValue, px + 16, top + labelH + 8, { width: panelW - 32, lineBreak: false });
  return y + height;
}

/** Split Header: outlined box, rows across the full width, the amount due as a solid bar underneath. */
function barTotal(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, x0, cw } = ctx;
  const b = m.box;
  const inset = 20;
  const inner = cw - inset * 2;
  const heights = rowHeights(ctx, b.rows, inner - 140);
  const barH = 46;
  const height = 38 + sum(heights) + (b.footnote ? 26 : 0) + 10 + barH + inset;
  y = ensureSpace(doc, y, height + 10);
  doc.roundedRect(x0, y, cw, height, 8).lineWidth(1).stroke(t.border);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(t.accent).text(b.title.replace(/^\d+\.\s*/, ""), x0 + inset, y + 16, { width: inner, characterSpacing: 0.6, lineBreak: false, ellipsis: true });
  let cy = drawRows(ctx, b.rows, heights, x0 + inset, y + 38, inner, inner - 140);
  if (b.footnote) {
    drawFootnote(ctx, b.footnote, x0 + inset, cy, inner);
    cy += 26;
  }
  cy += 10;
  doc.roundedRect(x0 + inset, cy, inner, barH, 6).fill(t.accent);
  const valueSize = fitSize(doc, "Helvetica-Bold", b.totalValue, 200, 18);
  const valueW = doc.font("Helvetica-Bold").fontSize(valueSize).widthOfString(b.totalValue);
  const labelW = inner - 32 - valueW - 20;
  doc.font("Helvetica-Bold").fontSize(9.5);
  const labelH = doc.heightOfString(b.totalLabel, { width: labelW });
  doc.fillColor(t.headingText).text(b.totalLabel, x0 + inset + 16, cy + (barH - labelH) / 2, { width: labelW });
  doc.font("Helvetica-Bold").fontSize(valueSize).text(b.totalValue, x0 + inset, cy + (barH - valueSize) / 2 + 1, { width: inner - 16, align: "right", lineBreak: false });
  return y + height;
}

/** Sidebar: no container — rows, then an accent rule and the amount due (also shown in the sidebar). */
function ruledTotal(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, x0, cw } = ctx;
  const b = m.box;
  const heights = rowHeights(ctx, b.rows, cw - 110);
  const valueSize = fitSize(doc, "Helvetica-Bold", b.totalValue, 150, 16);
  const title = b.title.replace(/^\d+\.\s*/, "");
  doc.font("Helvetica-Bold").fontSize(9.5);
  const titleH = doc.heightOfString(title, { width: cw - 14, characterSpacing: 1 });
  const labelH = doc.heightOfString(b.totalLabel, { width: cw - 170 });
  const height = 20 + titleH + sum(heights) + (b.footnote ? 26 : 0) + 16 + Math.max(labelH, valueSize);
  y = ensureSpace(doc, y, height + 10);
  hr(doc, x0, y, cw, t.border, 1);
  doc.rect(x0, y + 14, 6, 6).fill(t.accent);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(t.accent).text(title, x0 + 14, y + 12, { width: cw - 14, characterSpacing: 1 });
  let cy = drawRows(ctx, b.rows, heights, x0, y + 20 + titleH, cw, cw - 110);
  if (b.footnote) {
    drawFootnote(ctx, b.footnote, x0, cy, cw);
    cy += 26;
  }
  hr(doc, x0, cy + 4, cw, t.accent, 1.5);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(t.text).text(b.totalLabel, x0, cy + 14, { width: cw - 170 });
  doc.font("Helvetica-Bold").fontSize(valueSize).fillColor(t.accent).text(b.totalValue, x0, cy + 12, { width: cw, align: "right", lineBreak: false });
  return y + height + 6;
}

/** Bold: thick rule, rows on the left, a big amount due with an accent underline on the right. */
function statementTotal(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, x0, cw } = ctx;
  const b = m.box;
  const rightW = 190;
  const rowsW = cw - rightW - 30;
  const heights = rowHeights(ctx, b.rows, rowsW - 80);
  const rowsH = sum(heights) + (b.footnote ? 26 : 0);
  const height = 44 + Math.max(rowsH, 90);
  y = ensureSpace(doc, y, height + 10);
  hr(doc, x0, y, cw, t.border, 2);
  const title = b.title.replace(/^\d+\.\s*/, "");
  const num = String(parseInt(b.title, 10) || 0).padStart(2, "0");
  doc.font("Helvetica-Bold").fontSize(18).fillColor(t.accent).text(num, x0, y + 14, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(t.text).text(title, x0 + 34, y + 18, { width: cw - 34, lineBreak: false, ellipsis: true });
  const cy = drawRows(ctx, b.rows, heights, x0, y + 44, rowsW, rowsW - 80);
  if (b.footnote) drawFootnote(ctx, b.footnote, x0, cy, rowsW);

  const rx = x0 + cw - rightW;
  const label = b.totalLabel.replace(/:$/, "");
  doc.font("Helvetica-Bold").fontSize(8).fillColor(t.accent);
  const labelH = doc.heightOfString(label, { width: rightW, characterSpacing: 1 });
  doc.text(label, rx, y + 48, { width: rightW, align: "right", characterSpacing: 1 });
  const valueSize = fitSize(doc, "Helvetica-Bold", b.totalValue, rightW, 28);
  const valueW = doc.font("Helvetica-Bold").fontSize(valueSize).widthOfString(b.totalValue);
  const vy = y + 56 + labelH;
  doc.fillColor(t.text).text(b.totalValue, rx, vy, { width: rightW, align: "right", lineBreak: false });
  doc.rect(rx + rightW - valueW, vy + valueSize + 4, valueW, 5).fill(t.accent);
  return y + Math.max(height, vy + valueSize + 12 - y);
}

// ----- Footer & watermark

/** Pinned to the bottom of the last page; slides into the bottom margin rather than orphan itself. */
function footer(ctx: Ctx, m: Model, y: number) {
  const { doc, t, layout, x0, cw } = ctx;
  if (layout === InvoiceLayout.BOLD) {
    // A full-width accent band along the bottom of the last page.
    const bandH = 46;
    if (y > PAGE.height - bandH - 10) doc.addPage();
    doc.page.margins.bottom = 0;
    const by = PAGE.height - bandH;
    doc.rect(0, by, PAGE.width, bandH).fill(t.accent);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(t.headingText).text(m.footer.thanks, x0, by + 11, { width: cw, lineBreak: false, ellipsis: true });
    doc.font("Helvetica").fontSize(8).fillColor(mix(t.headingText, t.accent, 0.25)).text(m.footer.note, x0, by + 26, { width: cw, lineBreak: false, ellipsis: true });
    return;
  }
  const pinned = PAGE.height - 56;
  if (y + 30 > PAGE.height - 8) {
    doc.addPage();
    y = pinned;
  } else {
    y = Math.max(y, pinned);
  }
  doc.page.margins.bottom = 0;
  hr(doc, x0, y, cw, t.border, 0.5);
  const align: Align = layout === InvoiceLayout.SIDEBAR ? "left" : "center";
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(t.text).text(m.footer.thanks, x0, y + 12, { width: cw, align, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8).fillColor(ctx.faint).text(m.footer.note, x0, y + 26, { width: cw, align, lineBreak: false, ellipsis: true });
}

/**
 * Big diagonal DRAFT / VOID mark on every page. With the template's own watermark on, DRAFT is left
 * out (the template's watermark stands in for it) but VOID is still drawn over it.
 */
function watermark(ctx: Ctx, status: string, hasCustom: boolean) {
  const { doc } = ctx;
  const word = status.startsWith("Draft") && !hasCustom ? "DRAFT" : status === "Void" ? "VOID" : null;
  if (!word) return;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
    doc
      .font("Helvetica-Bold")
      .fontSize(110)
      .fillColor(word === "VOID" ? FIXED.red : ctx.faint)
      .fillOpacity(0.12)
      .text(word, 0, PAGE.height / 2 - 60, { width: PAGE.width, align: "center", lineBreak: false });
    doc.restore();
  }
}

/**
 * The template's watermark on every page, over the content: one copy in the middle of the page, or
 * (repeat) a grid of copies `gapX` / `gapY` apart. The whole grid turns about the page center, so it
 * is laid out over the page's diagonal to still reach the corners.
 */
function customWatermark(ctx: Ctx, w: InvoiceWatermark) {
  const { doc } = ctx;
  const cx = PAGE.width / 2;
  const cy = PAGE.height / 2;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rotate(w.rotation, { origin: [cx, cy] });
    doc.font("Helvetica-Bold").fontSize(w.size).fillColor(w.color).fillOpacity(w.opacity / 100);
    const textW = doc.widthOfString(w.text);
    const textH = doc.currentLineHeight();
    const at = (x: number, y: number) => doc.text(w.text, x - textW / 2, y - textH / 2, { lineBreak: false });
    if (w.repeat) {
      const stepX = textW + w.gapX;
      const stepY = textH + w.gapY;
      const reach = Math.hypot(PAGE.width, PAGE.height) / 2;
      const cols = Math.ceil(reach / stepX);
      const rows = Math.ceil(reach / stepY);
      for (let r = -rows; r <= rows; r++) {
        for (let c = -cols; c <= cols; c++) at(cx + c * stepX, cy + r * stepY);
      }
    } else {
      at(cx, cy);
    }
    doc.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers.

function rowColor(ctx: Ctx, row: BoxRow) {
  return row.color === "accent" ? ctx.t.accent : (row.color ?? ctx.t.text);
}

/** pdfkit reads PNG/JPEG only; anything else is dropped up front so layouts don't reserve space for it. */
function usableLogo(logo: Buffer | null): Buffer | null {
  if (!logo || logo.length < 4) return null;
  const png = logo[0] === 0x89 && logo[1] === 0x50 && logo[2] === 0x4e && logo[3] === 0x47;
  const jpeg = logo[0] === 0xff && logo[1] === 0xd8;
  return png || jpeg ? logo : null;
}

function logoAt(ctx: Ctx, x: number, y: number, w: number, h: number, align: "left" | "center" | "right" = "left") {
  if (!ctx.logo) return;
  try {
    ctx.doc.image(ctx.logo, x, y, { fit: [w, h], ...(align === "left" ? {} : { align }), valign: "center" });
  } catch {
    // A damaged image behind a valid PNG/JPEG header — leave the space empty rather than fail the PDF.
  }
}

/** Wrapped text; returns the y just below it. */
function textBlock(doc: Doc, text: string, x: number, y: number, width: number, font: string, size: number, color: string, spacing = 0) {
  doc.font(font).fontSize(size).fillColor(color).text(text, x, y, { width, characterSpacing: spacing });
  return y + doc.heightOfString(text, { width, characterSpacing: spacing });
}

function metaRight(doc: Doc, label: string, value: string, y: number, labelColor: string, valueColor: string, size: number) {
  doc.fontSize(size);
  const valueWidth = doc.font("Helvetica-Bold").widthOfString(value);
  const labelWidth = doc.font("Helvetica").widthOfString(`${label} `);
  const x = PAGE.margin + CW - valueWidth - labelWidth;
  doc.font("Helvetica").fillColor(labelColor).text(`${label} `, x, y, { lineBreak: false });
  doc.font("Helvetica-Bold").fillColor(valueColor).text(value, x + labelWidth, y, { lineBreak: false });
}

function hr(doc: Doc, x: number, y: number, w: number, color: string, width: number) {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(width).strokeColor(color).stroke();
}

function ensureSpace(doc: Doc, y: number, needed: number) {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return PAGE.margin;
}

/** Largest font size ≤ max (and ≥ min) at which the text fits the width. */
function fitSize(doc: Doc, font: string, text: string, width: number, max: number, min = 11) {
  let size = max;
  while (size > min && doc.font(font).fontSize(size).widthOfString(text) > width) size -= 1;
  return size;
}

/** Blends color a toward b by t (0 = a, 1 = b). Colors are #rrggbb. */
function mix(a: string, b: string, t: number) {
  const pa = rgb(a);
  const pb = rgb(b);
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function rgb(hex: string) {
  const s = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0);
}
