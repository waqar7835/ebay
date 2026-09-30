import PDFDocument from "pdfkit";
import { InvoiceLayout, InvoiceLineKind, InvoiceTemplateColors, Role } from "@ebay-order-management/shared";
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
}

type Doc = PDFKit.PDFDocument;
type Align = "left" | "right" | "center";
interface Column {
  header: string;
  width: number;
  align: Align;
}

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CW = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin;
/** Meaning-carrying colors stay fixed whatever the template: profit in green, VOID in red. */
const FIXED = { green: "#15803d", red: "#dc2626" };

export function renderTemplatedInvoicePdf(input: TemplatedPdfInput): Promise<Buffer> {
  const model = input.role === Role.ACCOUNT_HOLDER ? accountHolderModel(input) : settlementModel(input);
  return draw(model, input.layout, input.colors, input.logo, input.invoiceNumber);
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

/** Column widths given as weights, scaled to the content width. */
function columns(spec: [string, number, Align][]): Column[] {
  const total = sum(spec.map((s) => s[1]));
  return spec.map(([header, weight, align]) => ({ header, width: (weight / total) * CW, align }));
}

/** Amount without the currency symbol, for table cells (the currency is in the header / note). */
function plain(value: number, currency: string) {
  return formatMoney(value, currency).replace(currencySymbol(currency), "");
}

function meta(input: TemplatedPdfInput, period: string | null): [string, string][] {
  return [
    ["Invoice #:", input.invoiceNumber],
    ["Date:", formatDate(input.date)],
    ...(period ? ([["Billing Period:", period]] as [string, string][]) : []),
    ["Status:", input.status],
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

/** Stock Owner / 3PL: what the company pays the partner. */
function settlementModel(input: TemplatedPdfInput): Model {
  const cur = input.currency;
  const money = (v: number) => formatMoney(v, cur);
  const company = input.company.name;
  const name = input.partnerName;
  const orderLines = input.lines.filter((l) => l.kind === InvoiceLineKind.ORDER);
  const extraLines = input.lines.filter((l) => l.kind !== InvoiceLineKind.ORDER);
  const extrasTotal = round2(sum(extraLines.map((l) => l.netAmount)));
  const isStockOwner = input.role === Role.STOCK_OWNER;
  const hasOrders = orderLines.length > 0;
  const splitLine = !hasOrders ? "" : isStockOwner ? stockOwnerSplitLabel(orderLines) : "Fixed fulfillment fee per order";

  const blocks: Block[] = [];
  let section = 1;
  let companyShare = 0;
  let partnerShare = 0;
  let costTotal = 0;
  let feesTotal = 0;
  let split: { company: number; partner: number } | null = null;

  if (hasOrders && isStockOwner) {
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
  } else if (hasOrders) {
    blocks.push({ type: "section", title: `${section++}. FULFILLMENT BREAKDOWN`, note: `Amounts in ${currencyLabel(cur)}` });
    blocks.push({
      type: "table",
      columns: columns([
        ["ORDER #", 190, "left"],
        ["ORDER DATE", 120, "left"],
        ["UNITS", 80, "center"],
        ["FEE", 125, "right"],
      ]),
      rows: orderLines.map((l) => {
        const d = l.details?.role === "THREE_PL" ? l.details : null;
        return [
          d?.orderRef ?? l.description,
          d ? formatDate(parseDateOnly(d.orderDate), true) : "",
          String(d?.units ?? ""),
          plain(l.netAmount, cur),
        ];
      }),
    });
    feesTotal = round2(sum(orderLines.map((l) => l.netAmount)));
    const units = sum(orderLines.map((l) => (l.details?.role === "THREE_PL" ? l.details.units : 0)));
    blocks.push({
      type: "summary",
      rows: [
        { label: "Orders Fulfilled:", value: String(orderLines.length) },
        { label: "Total Units:", value: `${units} Units` },
        { label: "Total Fulfillment Fees:", value: money(feesTotal), bold: true, color: FIXED.green },
      ],
    });
  }
  blocks.push(...extrasBlocks(`${section}. ADJUSTMENTS & MISCELLANEOUS`, extraLines, money));
  if (extraLines.length) section++;

  const rows: BoxRow[] = [];
  if (hasOrders && isStockOwner) {
    rows.push({ label: "Total Net Profit Generated:", value: money(round2(companyShare + partnerShare)), bold: true });
    rows.push({ label: `• ${company} Profit Share${pct(split?.company)}:`, value: money(companyShare), indent: true });
    rows.push({ label: `• ${name} Profit Share${pct(split?.partner)}:`, value: money(partnerShare), indent: true });
    rows.push({ label: `Item Cost Reimbursement to ${name}:`, value: money(costTotal), bold: true });
  } else if (hasOrders) {
    rows.push({ label: "Total Fulfillment Fees:", value: money(feesTotal), bold: true });
  }
  if (extraLines.length) rows.push({ label: "Adjustments & Miscellaneous:", value: money(extrasTotal), bold: true });

  // Spell out the basis, but only when it's exactly that (uniform split, no extra lines).
  const basis = hasOrders && isStockOwner && split && !extraLines.length ? ` (Cost + ${split.partner}% Profit)` : "";
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
        lines: [isStockOwner ? "Stock Sales Settlement" : "3PL Fulfillment Settlement", ...(splitLine ? [splitLine] : [])],
      },
    ],
    blocks,
    box: {
      title: `${section}. FINAL SETTLEMENT${isStockOwner ? " & PROFIT SHARING BREAKDOWN" : ""}`,
      rows,
      totalLabel: `TOTAL PAYABLE TO ${name.toUpperCase()}${basis}:`,
      totalValue: money(input.totalAmount),
      footnote:
        hasOrders && isStockOwner
          ? [`${company.toUpperCase()} NET RETENTION${pct(split?.company, " Profit Share")}:`, money(companyShare)]
          : undefined,
    },
    footer: { thanks: `Thank you for business with ${company}!`, note: "Computer Generated Official Settlement Invoice" },
    status: input.status,
  };
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
// Drawing.

interface Ctx {
  doc: Doc;
  t: InvoiceTemplateColors;
  layout: InvoiceLayout;
  logo: Buffer | null;
  /** Secondary text / labels. */
  muted: string;
  faint: string;
  /** Light accent washes for cards, zebra rows and the total row. */
  tint: string;
  tint2: string;
}

function draw(model: Model, layout: InvoiceLayout, colors: InvoiceTemplateColors, logo: Buffer | null, number: string) {
  const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true, info: { Title: `Invoice ${number}` } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const ctx: Ctx = {
    doc,
    t: colors,
    layout,
    logo: usableLogo(logo),
    muted: mix(colors.text, colors.background, 0.38),
    faint: mix(colors.text, colors.background, 0.6),
    tint: mix(colors.accent, colors.background, 0.94),
    tint2: mix(colors.accent, colors.background, 0.88),
  };
  pageDecor(ctx, true);
  doc.on("pageAdded", () => pageDecor(ctx, false));

  let y = header(ctx, model);
  y = parties(ctx, model, y);
  if (layout === InvoiceLayout.EDGE) y = heroTotal(ctx, model, y);
  for (const block of model.blocks) {
    if (block.type === "section") y = sectionTitle(ctx, block.title, y, block.note);
    else if (block.type === "table") y = table(ctx, block, y) + 8;
    else y = summary(ctx, block.rows, y + 6) + 10;
  }
  y = totalBox(ctx, model, y + 10);
  footer(ctx, model, y + 12);
  watermark(ctx, model.status);
  doc.end();
  return done;
}

/** Background and the layout's page furniture, on every page. */
function pageDecor(ctx: Ctx, first: boolean) {
  const { doc, t, layout } = ctx;
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(t.background);
  if (layout === InvoiceLayout.EDGE) doc.rect(0, 0, 10, PAGE.height).fill(t.accent);
  if (layout === InvoiceLayout.ELEGANT) {
    doc.rect(0, 0, PAGE.width, 6).fill(t.accent);
    doc.rect(0, PAGE.height - 6, PAGE.width, 6).fill(t.accent);
  }
  if (layout === InvoiceLayout.BANNER && !first) doc.rect(0, 0, PAGE.width, 14).fill(t.accent);
  if (layout === InvoiceLayout.MINIMAL) doc.rect(PAGE.margin, 22, 36, 3).fill(t.accent);
}

function header(ctx: Ctx, m: Model): number {
  const { doc, t, layout } = ctx;
  const x = PAGE.margin;

  if (layout === InvoiceLayout.BANNER) {
    const height = 150;
    doc.rect(0, 0, PAGE.width, height).fill(t.accent);
    // The logo sits on a background-colored chip so any logo stays readable on the banner.
    if (ctx.logo) {
      doc.roundedRect(x, 34, 70, 70, 12).fill(t.background);
      logoAt(ctx, x + 9, 43, 52, 52);
    }
    const tx = ctx.logo ? x + 88 : x;
    doc.font("Helvetica-Bold").fontSize(20).fillColor(t.headingText).text(m.companyName, tx, 46, { width: 200, lineBreak: false, ellipsis: true });
    doc.font("Helvetica").fontSize(9).fillColor(mix(t.headingText, t.accent, 0.25)).text(m.subtitle, tx, 72, { width: 200 });
    doc.font("Helvetica-Bold").fontSize(26).fillColor(t.headingText).text(m.title, x, 40, { width: CW, align: "right", characterSpacing: 1 });
    let my = 78;
    for (const [label, value] of m.meta) {
      metaRight(doc, label, value, my, mix(t.headingText, t.accent, 0.3), t.headingText, 9);
      my += 13;
    }
    return height + 28;
  }

  if (layout === InvoiceLayout.MINIMAL) {
    const top = 48;
    doc.font("Helvetica").fontSize(30).fillColor(t.text).text(sentenceCase(m.title), x, top, { width: 330, characterSpacing: -0.5 });
    doc.font("Helvetica").fontSize(9.5).fillColor(ctx.muted).text(`${m.companyName} · ${m.subtitle}`, x, top + 40, { width: 330 });
    logoAt(ctx, x + CW - 60, top - 4, 60, 60, "right");
    let y = top + 82;
    const colW = CW / m.meta.length;
    m.meta.forEach(([label, value], i) => {
      doc.font("Helvetica").fontSize(8).fillColor(ctx.muted).text(label.replace(":", "").toUpperCase(), x + i * colW, y, { width: colW - 10, characterSpacing: 0.8 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(t.text).text(value, x + i * colW, y + 14, { width: colW - 10, lineBreak: false, ellipsis: true });
    });
    y += 40;
    hr(doc, x, y, CW, t.border, 0.75);
    return y + 26;
  }

  if (layout === InvoiceLayout.EDGE) {
    const top = PAGE.margin;
    logoAt(ctx, x, top, 64, 56);
    const tx = ctx.logo ? x + 78 : x;
    doc.font("Helvetica-Bold").fontSize(15).fillColor(t.text).text(m.companyName, tx, top + 10, { width: 220, lineBreak: false, ellipsis: true });
    doc.font("Helvetica").fontSize(9).fillColor(ctx.muted).text(m.subtitle, tx, top + 30, { width: 220 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(t.accent).text(m.title, x, top + 2, { width: CW, align: "right", characterSpacing: 2.5 });
    let my = top + 20;
    for (const [label, value] of m.meta) {
      metaRight(doc, label, value, my, ctx.muted, t.text, 9);
      my += 13;
    }
    return Math.max(my, top + 64) + 22;
  }

  if (layout === InvoiceLayout.ELEGANT) {
    let y = 34;
    if (ctx.logo) {
      logoAt(ctx, PAGE.width / 2 - 30, y, 60, 50, "center");
      y += 58;
    }
    doc.font("Times-Bold").fontSize(26).fillColor(t.accent).text(m.title, x, y, { width: CW, align: "center", characterSpacing: 3 });
    y += 32;
    doc.font("Times-Italic").fontSize(11).fillColor(ctx.muted).text(`${m.companyName} — ${m.subtitle}`, x, y, { width: CW, align: "center" });
    y += 24;
    hr(doc, x, y, CW, t.border, 0.75);
    hr(doc, x, y + 3, CW, t.border, 0.75);
    y += 12;
    const line = m.meta.map(([label, value]) => `${label.replace(":", "")}  ${value}`).join("     ·     ");
    doc.font("Helvetica").fontSize(9).fillColor(t.text).text(line, x, y, { width: CW, align: "center" });
    y += 18;
    hr(doc, x, y, CW, t.border, 0.75);
    return y + 24;
  }

  // Classic.
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

function parties(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, layout } = ctx;
  const gap = 20;
  const w = (CW - gap) / 2;
  const h = 72;
  const open = layout === InvoiceLayout.MINIMAL || layout === InvoiceLayout.EDGE;
  m.parties.forEach((p, i) => {
    const x = PAGE.margin + i * (w + gap);
    let tx = x + 16;
    let ty = y + 14;
    if (layout === InvoiceLayout.CLASSIC) {
      doc.roundedRect(x, y, w, h, 5).fill(ctx.tint);
      doc.rect(x, y, 3, h).fill(t.border);
    } else if (layout === InvoiceLayout.BANNER) {
      doc.roundedRect(x, y, w, h, 8).fill(ctx.tint);
    } else if (open) {
      tx = x;
      ty = y;
    } else {
      doc.rect(x, y, w, h).lineWidth(0.75).stroke(t.border);
    }
    const labelColor = layout === InvoiceLayout.MINIMAL ? ctx.muted : t.accent;
    const serif = layout === InvoiceLayout.ELEGANT;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(labelColor).text(p.title, tx, ty, { width: w - 32, characterSpacing: 1.2 });
    doc
      .font(serif ? "Times-Bold" : "Helvetica-Bold")
      .fontSize(serif ? 14 : 12.5)
      .fillColor(t.text)
      .text(p.headline, tx, ty + 15, { width: w - 32, lineBreak: false, ellipsis: true });
    let ly = ty + 34;
    for (const line of p.lines) {
      doc.font("Helvetica").fontSize(9).fillColor(ctx.muted).text(line, tx, ly, { width: w - 32, lineBreak: false, ellipsis: true });
      ly += 13;
    }
  });
  return open ? y + 72 : y + h + 24;
}

/** Edge: the amount due up top, summary-first. */
function heroTotal(ctx: Ctx, m: Model, y: number): number {
  const { doc, t } = ctx;
  const h = 64;
  const soft = mix(t.headingText, t.accent, 0.25);
  doc.roundedRect(PAGE.margin, y, CW, h, 8).fill(t.accent);
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(soft)
    .text(m.box.totalLabel.replace(/:$/, ""), PAGE.margin + 20, y + 16, { width: CW - 230, characterSpacing: 1, lineBreak: false, ellipsis: true });
  const date = m.meta.find(([label]) => label.startsWith("Date"))?.[1] ?? "";
  doc.font("Helvetica").fontSize(9).fillColor(soft).text(date, PAGE.margin + 20, y + 34, { width: CW - 230 });
  const size = fitSize(doc, "Helvetica-Bold", m.box.totalValue, 200, 24);
  doc.font("Helvetica-Bold").fontSize(size).fillColor(t.headingText).text(m.box.totalValue, PAGE.margin + 20, y + (h - size) / 2, { width: CW - 40, align: "right" });
  return y + h + 28;
}

function sectionTitle(ctx: Ctx, title: string, y: number, note?: string): number {
  const { doc, t, layout } = ctx;
  const x = PAGE.margin;
  const bare = title.replace(/^\d+\.\s*/, "");
  y = ensureSpace(doc, y + 8, 90);
  if (note) {
    doc.font("Helvetica").fontSize(8).fillColor(ctx.muted).text(note, x, y + (layout === InvoiceLayout.ELEGANT ? 4 : 2), { width: CW, align: "right" });
  }
  switch (layout) {
    case InvoiceLayout.BANNER:
      doc.roundedRect(x, y, 4, 14, 2).fill(t.accent);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(t.accent).text(bare, x + 12, y + 2, { width: CW - 150, characterSpacing: 0.8 });
      return y + 24;
    case InvoiceLayout.MINIMAL:
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(t.accent).text(bare, x, y, { width: CW - 150, characterSpacing: 1.4 });
      return y + 20;
    case InvoiceLayout.EDGE:
      doc.circle(x + 4, y + 5, 4).fill(t.accent);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(t.text).text(bare, x + 16, y, { width: CW - 160, characterSpacing: 0.3 });
      return y + 22;
    case InvoiceLayout.ELEGANT:
      doc.font("Times-Bold").fontSize(13).fillColor(t.accent).text(titleCase(bare), x, y, { width: CW - 150 });
      hr(doc, x, y + 19, 40, t.border, 1.5);
      return y + 30;
    default:
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(t.accent).text(title, x, y, { width: CW - 130, characterSpacing: 0.3 });
      hr(doc, x, y + 19, CW, t.border, 1);
      return y + 29;
  }
}

function table(
  ctx: Ctx,
  opts: { columns: Column[]; rows: string[][]; boldLastRow?: boolean; columnColors?: Record<number, string> },
  y: number,
): number {
  const { doc, t, layout } = ctx;
  const { columns: cols, rows } = opts;
  const pad = 8;
  const x0 = PAGE.margin;
  const filledHeader = layout === InvoiceLayout.CLASSIC || layout === InvoiceLayout.BANNER || layout === InvoiceLayout.ELEGANT;
  const zebra = layout === InvoiceLayout.CLASSIC || layout === InvoiceLayout.BANNER;

  const drawHeader = (hy: number) => {
    doc.font("Helvetica-Bold").fontSize(8);
    const height = Math.max(...cols.map((c) => doc.heightOfString(c.header, { width: c.width - pad * 2 }))) + (filledHeader ? 14 : 12);
    if (filledHeader) {
      if (layout === InvoiceLayout.BANNER) doc.roundedRect(x0, hy, CW, height, 5).fill(t.accent);
      else doc.rect(x0, hy, CW, height).fill(t.accent);
    } else if (layout === InvoiceLayout.EDGE) {
      doc.rect(x0, hy, CW, height).fill(ctx.tint);
    }
    const headerColor = filledHeader ? t.headingText : layout === InvoiceLayout.MINIMAL ? ctx.muted : t.accent;
    let x = x0;
    for (const c of cols) {
      const h = doc.heightOfString(c.header, { width: c.width - pad * 2 });
      doc.fillColor(headerColor).text(c.header, x + pad, hy + (height - h) / 2, { width: c.width - pad * 2, align: c.align, characterSpacing: 0.4 });
      x += c.width;
    }
    if (layout === InvoiceLayout.MINIMAL) hr(doc, x0, hy + height, CW, t.accent, 1.25);
    return hy + height;
  };

  y = ensureSpace(doc, y, 60);
  y = drawHeader(y);
  rows.forEach((row, r) => {
    const last = opts.boldLastRow && r === rows.length - 1;
    const font = (i: number) => (last || i === 0 ? "Helvetica-Bold" : "Helvetica");
    const heights = row.map((cell, i) => doc.font(font(i)).fontSize(9).heightOfString(cell, { width: cols[i].width - pad * 2 }));
    const height = Math.max(...heights) + 12;
    if (y + height > BOTTOM) {
      doc.addPage();
      y = drawHeader(PAGE.margin + (layout === InvoiceLayout.BANNER ? 10 : 0));
    }
    if (last) doc.rect(x0, y, CW, height).fill(ctx.tint2);
    else if (zebra && r % 2 === 1) doc.rect(x0, y, CW, height).fill(ctx.tint);
    let x = x0;
    row.forEach((cell, i) => {
      const c = cols[i];
      doc
        .font(font(i))
        .fontSize(9)
        .fillColor(opts.columnColors?.[i] ?? t.text)
        .text(cell, x + pad, y + (height - heights[i]) / 2, { width: c.width - pad * 2, align: c.align });
      x += c.width;
    });
    if (!zebra || layout === InvoiceLayout.CLASSIC) hr(doc, x0, y + height, CW, t.border, 0.5);
    y += height;
  });
  return y;
}

function summary(ctx: Ctx, rows: BoxRow[], y: number): number {
  const { doc, t } = ctx;
  y = ensureSpace(doc, y, rows.length * 16);
  const valueX = PAGE.margin + CW - 130;
  for (const r of rows) {
    doc
      .font(r.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9.5)
      .fillColor(r.bold ? t.text : ctx.muted)
      .text(r.label, PAGE.margin, y, { width: valueX - PAGE.margin - 20, align: "right" });
    doc.font("Helvetica-Bold").fillColor(rowColor(ctx, r)).text(r.value, valueX, y, { width: 122, align: "right" });
    y += 16;
  }
  return y;
}

/** Final settlement / payable: breakdown rows on the left, the amount due in a solid panel on the right. */
function totalBox(ctx: Ctx, m: Model, y: number): number {
  const { doc, t, layout } = ctx;
  const b = m.box;
  const x = PAGE.margin;
  const inset = layout === InvoiceLayout.MINIMAL ? 0 : 20;
  const inner = CW - inset * 2;
  const panelW = 170;
  const gap = 22;
  const rowsW = inner - panelW - gap;
  const rowH = 17;
  // Long labels (e.g. a long partner name) wrap rather than get cut off.
  const labelWidth = (r: BoxRow) => rowsW - 76 - (r.indent ? 10 : 0);
  const rowHeights = b.rows.map(
    (r) => Math.max(rowH, doc.font(r.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(r.label, { width: labelWidth(r) }) + 6),
  );
  const rowsH = sum(rowHeights) + (b.footnote ? 26 : 0);
  const height = 38 + Math.max(rowsH, 90) + 12;
  y = ensureSpace(doc, y, height + 10);

  if (layout === InvoiceLayout.CLASSIC) doc.roundedRect(x, y, CW, height, 6).lineWidth(1).fillAndStroke(ctx.tint, t.border);
  else if (layout === InvoiceLayout.BANNER || layout === InvoiceLayout.EDGE) doc.roundedRect(x, y, CW, height, 8).fill(ctx.tint);
  else if (layout === InvoiceLayout.ELEGANT) {
    doc.rect(x, y, CW, height).lineWidth(0.75).stroke(t.border);
    doc.rect(x + 3, y + 3, CW - 6, height - 6).lineWidth(0.75).stroke(t.border);
  } else hr(doc, x, y, CW, t.border, 0.75);

  const serif = layout === InvoiceLayout.ELEGANT;
  const title = layout === InvoiceLayout.CLASSIC ? b.title : b.title.replace(/^\d+\.\s*/, "");
  doc
    .font(serif ? "Times-Bold" : "Helvetica-Bold")
    .fontSize(serif ? 13 : 10.5)
    .fillColor(t.accent)
    .text(serif ? titleCase(title) : title, x + inset, y + 16, { width: inner, characterSpacing: serif ? 0 : 0.4, lineBreak: false, ellipsis: true });

  let cy = y + 38;
  b.rows.forEach((r, i) => {
    doc
      .font(r.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor(r.bold ? t.text : ctx.muted)
      .text(r.label, x + inset + (r.indent ? 10 : 0), cy, { width: labelWidth(r) });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(rowColor(ctx, r)).text(r.value, x + inset, cy, { width: rowsW, align: "right" });
    cy += rowHeights[i];
  });
  if (b.footnote) {
    hr(doc, x + inset, cy + 2, rowsW, t.border, 0.5);
    doc.font("Helvetica").fontSize(8).fillColor(ctx.muted).text(b.footnote[0], x + inset, cy + 10, { width: rowsW - 70, lineBreak: false, ellipsis: true });
    doc.text(b.footnote[1], x + inset, cy + 10, { width: rowsW, align: "right" });
  }

  const px = x + inset + rowsW + gap;
  const py = y + 38;
  const ph = height - 38 - 12;
  doc.roundedRect(px, py, panelW, ph, serif || layout === InvoiceLayout.MINIMAL ? 0 : 6).fill(t.accent);
  const label = b.totalLabel.replace(/:$/, "");
  const valueFont = serif ? "Times-Bold" : "Helvetica-Bold";
  const valueSize = fitSize(doc, valueFont, b.totalValue, panelW - 32, 22);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(mix(t.headingText, t.accent, 0.2));
  const labelH = doc.heightOfString(label, { width: panelW - 32, characterSpacing: 0.8 });
  const top = py + (ph - (labelH + 8 + valueSize)) / 2;
  doc.text(label, px + 16, top, { width: panelW - 32, characterSpacing: 0.8 });
  doc.font(valueFont).fontSize(valueSize).fillColor(t.headingText).text(b.totalValue, px + 16, top + labelH + 8, { width: panelW - 32, lineBreak: false });
  return y + height;
}

/** Pinned to the bottom of the last page; slides into the bottom margin rather than orphan itself. */
function footer(ctx: Ctx, m: Model, y: number) {
  const { doc, t, layout } = ctx;
  const pinned = PAGE.height - 56;
  if (y + 30 > PAGE.height - 8) {
    doc.addPage();
    y = pinned;
  } else {
    y = Math.max(y, pinned);
  }
  doc.page.margins.bottom = 0;
  hr(doc, PAGE.margin, y, CW, t.border, 0.5);
  const align: Align = layout === InvoiceLayout.MINIMAL || layout === InvoiceLayout.EDGE ? "left" : "center";
  doc
    .font(layout === InvoiceLayout.ELEGANT ? "Times-Italic" : "Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(t.text)
    .text(m.footer.thanks, PAGE.margin, y + 12, { width: CW, align, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8).fillColor(ctx.faint).text(m.footer.note, PAGE.margin, y + 26, { width: CW, align, lineBreak: false, ellipsis: true });
}

/** Big diagonal DRAFT / VOID mark on every page. */
function watermark(ctx: Ctx, status: string) {
  const { doc } = ctx;
  const word = status.startsWith("Draft") ? "DRAFT" : status === "Void" ? "VOID" : null;
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

/** Largest font size ≤ max at which the text fits the width. */
function fitSize(doc: Doc, font: string, text: string, width: number, max: number) {
  let size = max;
  while (size > 11 && doc.font(font).fontSize(size).widthOfString(text) > width) size -= 1;
  return size;
}

/** "ACCOUNT INVOICE" → "Account invoice". */
function sentenceCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** "PRODUCT BREAKDOWN (PROFIT SHARE)" → "Product Breakdown (Profit Share)", keeping "3PL". */
function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s(&/])([a-z])/g, (_, before: string, c: string) => before + c.toUpperCase())
    .replace(/\b3pl\b/gi, "3PL");
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
