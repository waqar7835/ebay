import PDFDocument from "pdfkit";
import { InvoiceLineDetails, InvoiceLineKind, InvoiceRole, Role } from "@ebay-order-management/shared";

/**
 * Draws an invoice PDF. Layouts follow the company's own samples: the Stock Owner "INVOICE"
 * (item sales & profit breakdown → settlement) and the Account Holder "ACCOUNT INVOICE" (product
 * breakdown → what the Account Holder pays the company). The 3PL invoice reuses the Stock Owner
 * layout. Everything is drawn from the invoice's own lines, so a re-download matches what was approved.
 *
 * Only invoices issued before invoice templates existed (`invoices.template` null) are still drawn
 * here, unchanged; everything else goes through `invoice-pdf-templated.ts`.
 */
export interface InvoicePdfInput {
  invoiceNumber: string;
  date: Date;
  status: string;
  company: { name: string; logo: Buffer | null };
  partnerName: string;
  role: InvoiceRole;
  currency: string;
  lines: InvoicePdfLine[];
  totalAmount: number;
}

export interface InvoicePdfLine {
  kind: InvoiceLineKind;
  description: string;
  deductionAmount: number;
  netAmount: number;
  details: InvoiceLineDetails | null;
}

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin;

const C = {
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  card: "#f8fafc",
  gold: "#c9971c",
  goldBright: "#d4af37",
  green: "#16a34a",
  blue: "#2563eb",
  red: "#dc2626",
  noteBg: "#fefce8",
  noteBorder: "#fde68a",
  noteTitle: "#854d0e",
};

type Doc = PDFKit.PDFDocument;
type Align = "left" | "right" | "center";
interface Column {
  header: string;
  width: number;
  align: Align;
}

export function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    info: { Title: `Invoice ${input.invoiceNumber}` },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (input.role === Role.ACCOUNT_HOLDER) drawAccountHolder(doc, input);
  else drawSettlement(doc, input);

  doc.end();
  return done;
}

// ---------------------------------------------------------------------------------------------
// Stock Owner / 3PL: what the company pays the partner.

function drawSettlement(doc: Doc, input: InvoicePdfInput) {
  const money = (v: number) => formatMoney(v, input.currency);
  const company = input.company.name;
  const orderLines = input.lines.filter((l) => l.kind === InvoiceLineKind.ORDER);
  const extraLines = input.lines.filter((l) => l.kind !== InvoiceLineKind.ORDER);
  const extrasTotal = round2(sum(extraLines.map((l) => l.netAmount)));
  const period = billingPeriod(orderLines);
  const isStockOwner = input.role === Role.STOCK_OWNER;

  // Header: logo left, title + meta right.
  const top = PAGE.margin;
  drawLogo(doc, input.company.logo, PAGE.margin, top, 80, 64);
  doc
    .font("Helvetica-Bold")
    .fontSize(30)
    .fillColor(C.ink)
    .text("INVOICE", PAGE.margin, top, { width: CONTENT_WIDTH, align: "right" });
  let y = top + 40;
  const meta: [string, string][] = [
    ["Invoice #:", input.invoiceNumber],
    ["Date:", formatDate(input.date)],
    ...(period ? ([["Billing Period:", period]] as [string, string][]) : []),
    ["Settlement Status:", input.status],
  ];
  for (const [label, value] of meta) {
    rightLabelValue(doc, label, value, y, 9.5);
    y += 14;
  }
  y = Math.max(y, top + 72) + 6;
  doc.rect(PAGE.margin, y, CONTENT_WIDTH, 2).fill(C.gold);
  y += 22;

  // Issued by / billed to cards.
  const hasOrders = orderLines.length > 0;
  const splitLine = !hasOrders
    ? ""
    : isStockOwner
      ? stockOwnerSplitLabel(orderLines)
      : "Fixed fulfillment fee per order";
  const cardW = (CONTENT_WIDTH - 20) / 2;
  drawCard(doc, PAGE.margin, y, cardW, "ISSUED BY", company, [
    "Sales & Settlement Department",
    `Currency: ${currencyLabel(input.currency)}`,
  ]);
  drawCard(doc, PAGE.margin + cardW + 20, y, cardW, "BILLED TO / PARTNER", input.partnerName, [
    isStockOwner ? "Stock Sales Settlement" : "3PL Fulfillment Settlement",
    ...(splitLine ? [splitLine] : []),
  ]);
  y += 100;

  let section = 1;
  let companyShare = 0;
  let partnerShare = 0;
  let costTotal = 0;
  let feesTotal = 0;
  let splitPercents: { company: number; partner: number } | null = null;

  if (!hasOrders) {
    // Misc-only invoice: nothing to break down.
  } else if (isStockOwner) {
    y = sectionTitle(doc, `${section++}. ITEM SALES & PROFIT BREAKDOWN`, y);
    const products = aggregateStockOwnerProducts(orderLines);
    const columns: Column[] = [
      { header: "ITEM DESCRIPTION", width: 118, align: "left" },
      { header: "QTY", width: 36, align: "center" },
      { header: "COST/\nITEM", width: 55, align: "right" },
      { header: "SELL\nPRICE", width: 55, align: "right" },
      { header: "PROFIT/\nITEM", width: 55, align: "right" },
      { header: "TOTAL\nCOST", width: 64, align: "right" },
      { header: "TOTAL\nSALES", width: 64, align: "right" },
      { header: "TOTAL\nPROFIT", width: 68, align: "right" },
    ];
    y = drawTable(
      doc,
      columns,
      products.map((p) => [
        p.title,
        String(p.quantity),
        money(p.cost),
        money(p.price),
        money(p.price - p.cost),
        money(p.cost * p.quantity),
        money(p.price * p.quantity),
        money((p.price - p.cost) * p.quantity),
      ]),
      y,
      { headerFill: C.ink, headerText: "#ffffff", firstColumnBold: true },
    );
    const units = sum(products.map((p) => p.quantity));
    const sales = round2(sum(products.map((p) => p.price * p.quantity)));
    costTotal = round2(sum(products.map((p) => p.cost * p.quantity)));
    const profit = round2(sales - costTotal);
    companyShare = round2(sum(orderLines.map((l) => l.deductionAmount)));
    partnerShare = round2(profit - companyShare);
    splitPercents = uniformStockOwnerSplit(orderLines);

    y = summaryRows(doc, y + 10, [
      ["Total Items Sold:", `${units} Units`],
      ["Gross Sales Amount:", money(sales)],
      ["Total Original Cost (Item Cost):", money(costTotal)],
      ["Total Net Profit Generated:", money(profit), { bold: true, valueColor: C.green }],
    ]);
  } else {
    y = sectionTitle(doc, `${section++}. FULFILLMENT BREAKDOWN`, y);
    const columns: Column[] = [
      { header: "ORDER #", width: 190, align: "left" },
      { header: "ORDER DATE", width: 120, align: "left" },
      { header: "UNITS", width: 80, align: "center" },
      { header: "FEE", width: CONTENT_WIDTH - 390, align: "right" },
    ];
    const rows = orderLines.map((l) => {
      const d = l.details?.role === "THREE_PL" ? l.details : null;
      return [
        d?.orderRef ?? l.description,
        d ? formatDate(parseDateOnly(d.orderDate), true) : "",
        String(d?.units ?? ""),
        money(l.netAmount),
      ];
    });
    y = drawTable(doc, columns, rows, y, { headerFill: C.ink, headerText: "#ffffff", firstColumnBold: true });
    feesTotal = round2(sum(orderLines.map((l) => l.netAmount)));
    const units = sum(orderLines.map((l) => (l.details?.role === "THREE_PL" ? l.details.units : 0)));
    y = summaryRows(doc, y + 10, [
      ["Orders Fulfilled:", String(orderLines.length)],
      ["Total Units:", `${units} Units`],
      ["Total Fulfillment Fees:", money(feesTotal), { bold: true, valueColor: C.green }],
    ]);
  }

  if (extraLines.length) y = drawExtras(doc, `${section++}. ADJUSTMENTS & MISCELLANEOUS`, extraLines, y + 14, money);

  // Final settlement box.
  const name = input.partnerName;
  const boxRows: SettlementRow[] = [];
  if (hasOrders && isStockOwner) {
    const profit = round2(companyShare + partnerShare);
    boxRows.push({ label: "Total Net Profit Generated:", value: money(profit), bold: true });
    boxRows.push({
      label: `• ${company} Profit Share${pct(splitPercents?.company)}:`,
      value: money(companyShare),
      indent: true,
    });
    boxRows.push({
      label: `• ${name} Profit Share${pct(splitPercents?.partner)}:`,
      value: money(partnerShare),
      indent: true,
    });
    boxRows.push({ label: `Item Cost Reimbursement to ${name}:`, value: money(costTotal), bold: true });
  } else if (hasOrders) {
    boxRows.push({ label: "Total Fulfillment Fees:", value: money(feesTotal), bold: true });
  }
  if (extraLines.length) boxRows.push({ label: "Adjustments & Miscellaneous:", value: money(extrasTotal), bold: true });

  // Spell out the basis like the sample, but only when it's exactly that (uniform split, no extra lines).
  const basis =
    hasOrders && isStockOwner && splitPercents && !extraLines.length
      ? ` (Cost + ${splitPercents.partner}% Profit)`
      : "";
  y = drawSettlementBox(
    doc,
    y + 18,
    `${section}. FINAL SETTLEMENT${isStockOwner ? " & PROFIT SHARING BREAKDOWN" : ""}`,
    boxRows,
    {
      label: `TOTAL PAYABLE TO ${name.toUpperCase()}${basis}:`,
      value: money(input.totalAmount),
      footnote:
        hasOrders && isStockOwner
          ? {
              label: `${company.toUpperCase()} NET RETENTION${pct(splitPercents?.company, " Profit Share")}:`,
              value: money(companyShare),
            }
          : undefined,
    },
  );

  footer(
    doc,
    y + 24,
    [
      [`Thank you for business with `, false],
      [company, true],
      ["!", false],
    ],
    "Computer Generated Official Settlement Invoice",
  );
  watermark(doc, input.status);
}

interface SettlementRow {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
}

function drawSettlementBox(
  doc: Doc,
  y: number,
  title: string,
  rows: SettlementRow[],
  total: { label: string; value: string; footnote?: { label: string; value: string } },
) {
  const inner = CONTENT_WIDTH - 40;
  const totalLabelWidth = inner - 105;
  const totalHeight = doc.font("Helvetica-Bold").fontSize(13).heightOfString(total.label, { width: totalLabelWidth });
  const height = 48 + rows.length * 24 + 12 + totalHeight + 10 + (total.footnote ? 20 : 0) + 8;
  y = ensureSpace(doc, y, height);
  const x = PAGE.margin;
  doc.roundedRect(x, y, CONTENT_WIDTH, height, 6).lineWidth(1).fillAndStroke(C.noteBg, C.noteBorder);
  let cy = y + 16;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(C.noteTitle)
    .text(title, x + 20, cy, { width: inner });
  cy += 22;
  dashedLine(doc, x + 20, cy, inner, C.noteBorder);
  cy += 10;
  for (const row of rows) {
    const font = row.bold ? "Helvetica-Bold" : "Helvetica";
    doc
      .font(font)
      .fontSize(10)
      .fillColor(C.text)
      .text(row.label, x + 20 + (row.indent ? 12 : 0), cy, { width: inner - 140 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(C.text)
      .text(row.value, x + 20, cy, { width: inner, align: "right" });
    cy += 24;
  }
  doc
    .moveTo(x + 20, cy - 4)
    .lineTo(x + 20 + inner, cy - 4)
    .lineWidth(1)
    .strokeColor(C.gold)
    .stroke();
  cy += 6;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(C.noteTitle)
    .text(total.label, x + 20, cy, { width: totalLabelWidth });
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(C.noteTitle)
    .text(total.value, x + 20, cy, { width: inner, align: "right" });
  cy += totalHeight + 10;
  if (total.footnote) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(C.muted)
      .text(total.footnote.label, x + 20, cy, { width: totalLabelWidth });
    doc.text(total.footnote.value, x + 20, cy, { width: inner, align: "right" });
  }
  return y + height;
}

// ---------------------------------------------------------------------------------------------
// Account Holder: what the Account Holder pays the company (they hold the eBay proceeds).

function drawAccountHolder(doc: Doc, input: InvoicePdfInput) {
  const money = (v: number) => formatMoney(v, input.currency);
  const company = input.company.name;
  const symbol = currencySymbol(input.currency).trim();
  const orderLines = input.lines.filter((l) => l.kind === InvoiceLineKind.ORDER);
  const extraLines = input.lines.filter((l) => l.kind !== InvoiceLineKind.ORDER);
  const extrasTotal = round2(sum(extraLines.map((l) => l.netAmount)));
  const period = billingPeriod(orderLines);

  const top = PAGE.margin;
  drawLogo(doc, input.company.logo, PAGE.margin, top, 80, 64);
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(C.goldBright)
    .text("ACCOUNT INVOICE", PAGE.margin, top + 6, { width: CONTENT_WIDTH, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(C.muted)
    .text(`${company.toUpperCase()} E-COMMERCE MANAGEMENT`, PAGE.margin, top + 38, {
      width: CONTENT_WIDTH,
      align: "right",
      characterSpacing: 0.5,
    });
  let y = top + 76;
  doc.rect(PAGE.margin, y, CONTENT_WIDTH, 2).fill(C.goldBright);
  y += 16;

  const cardW = (CONTENT_WIDTH - 24) / 2;
  goldCard(doc, PAGE.margin, y, cardW, "BILLED TO", input.partnerName, ["Marketplace Account Statement"]);
  goldCard(doc, PAGE.margin + cardW + 24, y, cardW, "STATEMENT DETAILS", `Date: ${formatDate(input.date)}`, [
    `Invoice #: ${input.invoiceNumber} · ${input.status}`,
    ...(period ? [`Billing Period: ${period}`] : []),
  ]);
  y += 98;

  let section = 1;
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
  if (hasOrders) {
    y = goldSectionTitle(doc, `${section++}. PRODUCT BREAKDOWN`, y);
    y = drawAccountHolderTable(doc, products, totals, profit, symbol, money, y);
  }

  if (extraLines.length)
    y = drawExtras(doc, `${section++}. ADJUSTMENTS & OTHER CHARGES`, extraLines, y + 14, money, true);

  // What the company is owed: its profit share + reimbursements (+ adjustments).
  const orderDue = round2(sum(orderLines.map((l) => l.netAmount)));
  const companyShare = round2(orderDue - totals.buying - totals.threePl - totals.shipping);
  const sharePercent = uniform(
    orderLines.map((l) => (l.details?.role === "ACCOUNT_HOLDER" ? l.details.companySharePercent : null)),
  );
  const cur = input.currency;
  const rows: [string, string, string?][] = [
    ...((hasOrders
      ? [
          ["Total Generated Net Profit:", `${money(profit)} ${cur}`],
          [`${company} Profit Share Due${pct(sharePercent)}:`, `${money(companyShare)} ${cur}`, C.blue],
          ["Buying Price Reimbursement:", `${money(totals.buying)} ${cur}`],
          ["3PL Warehouse Charges Reimbursement:", `${money(totals.threePl)} ${cur}`],
          // Only labels bought outside eBay; eBay-bought labels are already out of the payout.
          ...(totals.shipping ? [["Shipping Label Reimbursement:", `${money(totals.shipping)} ${cur}`]] : []),
        ]
      : []) as [string, string, string?][]),
    ...(extraLines.length
      ? ([["Adjustments & Other Charges:", `${money(extrasTotal)} ${cur}`]] as [string, string][])
      : []),
  ];
  drawAccountHolderPayable(doc, input, rows, section, y, money);
}

function drawAccountHolderTable(
  doc: Doc,
  products: AccountHolderRow[],
  totals: Omit<AccountHolderRow, "title">,
  profit: number,
  symbol: string,
  money: (v: number) => string,
  y: number,
) {
  // The Shipping column only appears when a label was bought outside eBay on one of the orders.
  const withShipping = totals.shipping !== 0;
  const columns: Column[] = withShipping
    ? [
        { header: "SOURCE", width: 135, align: "left" },
        { header: "QTY", width: 40, align: "center" },
        { header: `SELLING (${symbol})`, width: 70, align: "right" },
        { header: `BUYING (${symbol})`, width: 70, align: "right" },
        { header: `3PL (${symbol})`, width: 60, align: "right" },
        { header: `SHIPPING (${symbol})`, width: 72, align: "right" },
        { header: `PROFIT (${symbol})`, width: CONTENT_WIDTH - 447, align: "right" },
      ]
    : [
        { header: "SOURCE", width: 165, align: "left" },
        { header: "QTY", width: 50, align: "center" },
        { header: `SELLING (${symbol})`, width: 80, align: "right" },
        { header: `BUYING (${symbol})`, width: 80, align: "right" },
        { header: `3PL (${symbol})`, width: 70, align: "right" },
        { header: `PROFIT (${symbol})`, width: CONTENT_WIDTH - 445, align: "right" },
      ];
  const row = (title: string, r: Omit<AccountHolderRow, "title">, rowProfit: number) => [
    title,
    String(r.quantity),
    money(r.selling),
    money(r.buying),
    money(r.threePl),
    ...(withShipping ? [money(r.shipping)] : []),
    money(rowProfit),
  ];
  return drawTable(
    doc,
    columns,
    [
      ...products.map((p) => row(p.title, p, p.selling - p.buying - p.threePl - p.shipping)),
      row("TOTAL SUMMARY", totals, profit),
    ],
    y,
    {
      headerFill: "#111111",
      headerText: C.goldBright,
      firstColumnBold: true,
      boldLastRow: true,
      columnColors: { [columns.length - 1]: C.green },
    },
  );
}

function drawAccountHolderPayable(
  doc: Doc,
  input: InvoicePdfInput,
  rows: [string, string, string?][],
  section: number,
  y: number,
  money: (v: number) => string,
) {
  const company = input.company.name;
  const height = rows.length * 26 + 80;
  y = goldSectionTitle(
    doc,
    `${section}. FINAL PAYABLE BREAKDOWN (PROFIT SHARE & REIMBURSEMENTS)`,
    ensureSpace(doc, y + 14, height + 30),
  );
  const x = PAGE.margin;
  doc.roundedRect(x, y, CONTENT_WIDTH, height, 6).lineWidth(1).fillAndStroke("#fafafa", C.goldBright);
  const inner = CONTENT_WIDTH - 40;
  let cy = y + 18;
  rows.forEach(([label, value, color], i) => {
    doc
      .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor(C.ink)
      .text(label, x + 20, cy, { width: inner - 150 });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(color ?? C.ink)
      .text(value, x + 20, cy, { width: inner - 60, align: "right" });
    cy += 18;
    dashedLine(doc, x + 20, cy, inner, C.line);
    cy += 8;
  });
  cy += 4;
  doc.roundedRect(x + 20, cy, inner, 40, 4).fill(C.goldBright);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#1a1a1a")
    .text("TOTAL AMOUNT PAYABLE BY CLIENT:", x + 38, cy + 14, { width: inner - 180 });
  doc
    .fontSize(16)
    .text(`${money(input.totalAmount)} ${input.currency}`, x + 20, cy + 12, { width: inner - 18, align: "right" });
  y += height;

  footer(
    doc,
    y + 24,
    [[company.toUpperCase(), true]],
    `${company} Operations & Management • Official Invoice Generated for ${input.partnerName}`,
  );
  watermark(doc, input.status);
}

// ---------------------------------------------------------------------------------------------
// Aggregation.

export interface StockOwnerRow {
  title: string;
  quantity: number;
  cost: number;
  price: number;
}

/** One row per product at a given cost/price, summed across the invoice's orders. */
export function aggregateStockOwnerProducts(lines: InvoicePdfLine[]): StockOwnerRow[] {
  const rows = new Map<string, StockOwnerRow>();
  for (const line of lines) {
    if (line.details?.role !== "STOCK_OWNER") continue;
    for (const p of line.details.products) {
      const key = `${p.productId}|${p.cost}|${p.price}`;
      const row = rows.get(key) ?? { title: p.title, quantity: 0, cost: p.cost, price: p.price };
      row.quantity += p.quantity;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

export interface AccountHolderRow {
  title: string;
  quantity: number;
  selling: number;
  buying: number;
  threePl: number;
  shipping: number;
}

export function aggregateAccountHolderProducts(lines: InvoicePdfLine[]): AccountHolderRow[] {
  const rows = new Map<string, AccountHolderRow>();
  for (const line of lines) {
    if (line.details?.role !== "ACCOUNT_HOLDER") continue;
    for (const p of line.details.products) {
      const row = rows.get(p.productId) ?? {
        title: p.title,
        quantity: 0,
        selling: 0,
        buying: 0,
        threePl: 0,
        shipping: 0,
      };
      row.quantity += p.quantity;
      row.selling = round2(row.selling + p.selling);
      row.buying = round2(row.buying + p.buying);
      row.threePl = round2(row.threePl + p.threePl);
      row.shipping = round2(row.shipping + (p.shipping ?? 0));
      rows.set(p.productId, row);
    }
  }
  return [...rows.values()];
}

/** Company/partner profit split when every product on the invoice has the same terms. */
export function uniformStockOwnerSplit(lines: InvoicePdfLine[]) {
  const companyPercents = lines.flatMap((l) =>
    l.details?.role === "STOCK_OWNER"
      ? l.details.products.map((p) => (p.payoutMode === "PROFIT_SHARE" ? (p.sharePercent ?? 0) : 0))
      : [],
  );
  const company = uniform(companyPercents);
  return company === null ? null : { company, partner: round2(100 - company) };
}

export function stockOwnerSplitLabel(lines: InvoicePdfLine[]) {
  const split = uniformStockOwnerSplit(lines);
  return split ? `Profit Split: ${split.partner}% / ${split.company}%` : "Profit Split: varies by product";
}

export function billingPeriod(lines: InvoicePdfLine[]): string | null {
  const dates = lines
    .map((l) => (l.details && "orderDate" in l.details ? l.details.orderDate : null))
    .filter((d): d is string => !!d)
    .sort();
  if (!dates.length) return null;
  const first = monthYear(dates[0]);
  const last = monthYear(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers.

function drawLogo(doc: Doc, logo: Buffer | null, x: number, y: number, w: number, h: number) {
  if (!logo) return;
  try {
    doc.image(logo, x, y, { fit: [w, h] });
  } catch {
    // Unsupported image format (pdfkit reads PNG/JPEG only) — leave the space empty.
  }
}

function rightLabelValue(doc: Doc, label: string, value: string, y: number, size: number) {
  doc.fontSize(size);
  const valueWidth = doc.font("Helvetica").widthOfString(value);
  const labelWidth = doc.font("Helvetica-Bold").widthOfString(`${label} `);
  const x = PAGE.margin + CONTENT_WIDTH - valueWidth - labelWidth;
  doc.font("Helvetica-Bold").fillColor(C.muted).text(`${label} `, x, y, { lineBreak: false });
  doc
    .font("Helvetica")
    .fillColor(C.text)
    .text(value, x + labelWidth, y, { lineBreak: false });
}

function drawCard(doc: Doc, x: number, y: number, w: number, title: string, name: string, lines: string[]) {
  doc.roundedRect(x, y, w, 80, 4).lineWidth(0.75).fillAndStroke(C.card, C.line);
  doc.rect(x, y, 3, 80).fill(C.gold);
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(C.ink)
    .text(title, x + 16, y + 12, { width: w - 28 });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(C.text)
    .text(name, x + 16, y + 30, { width: w - 28, lineBreak: false, ellipsis: true });
  let ly = y + 45;
  for (const line of lines) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(C.text)
      .text(line, x + 16, ly, { width: w - 28, lineBreak: false, ellipsis: true });
    ly += 14;
  }
}

function goldCard(doc: Doc, x: number, y: number, w: number, title: string, headline: string, lines: string[]) {
  doc.rect(x, y, w, 80).lineWidth(0.75).fillAndStroke("#fafafa", C.goldBright);
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(C.gold)
    .text(title, x + 14, y + 12, { width: w - 28 });
  doc
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .fillColor(C.ink)
    .text(headline, x + 14, y + 26, { width: w - 28, lineBreak: false, ellipsis: true });
  let ly = y + 45;
  for (const line of lines) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(line, x + 14, ly, { width: w - 28, lineBreak: false, ellipsis: true });
    ly += 13;
  }
}

function sectionTitle(doc: Doc, title: string, y: number) {
  y = ensureSpace(doc, y, 80);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(C.ink)
    .text(title, PAGE.margin, y, { width: CONTENT_WIDTH, characterSpacing: 0.3 });
  doc
    .moveTo(PAGE.margin, y + 20)
    .lineTo(PAGE.margin + CONTENT_WIDTH, y + 20)
    .lineWidth(1)
    .strokeColor("#cbd5e1")
    .stroke();
  return y + 30;
}

function goldSectionTitle(doc: Doc, title: string, y: number) {
  y = ensureSpace(doc, y, 80);
  doc.rect(PAGE.margin, y, 3, 13).fill(C.goldBright);
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(C.ink)
    .text(title, PAGE.margin + 10, y + 1.5, { width: CONTENT_WIDTH - 10, characterSpacing: 0.3 });
  return y + 22;
}

function drawTable(
  doc: Doc,
  columns: Column[],
  rows: string[][],
  y: number,
  opts: {
    headerFill: string;
    headerText: string;
    firstColumnBold?: boolean;
    boldLastRow?: boolean;
    columnColors?: Record<number, string>;
  },
) {
  const pad = 8;
  const drawHeader = (hy: number) => {
    doc.font("Helvetica-Bold").fontSize(8.5);
    const height = Math.max(...columns.map((c) => doc.heightOfString(c.header, { width: c.width - pad * 2 }))) + 18;
    doc.rect(PAGE.margin, hy, CONTENT_WIDTH, height).fill(opts.headerFill);
    let x = PAGE.margin;
    for (const c of columns) {
      const h = doc.heightOfString(c.header, { width: c.width - pad * 2 });
      doc
        .fillColor(opts.headerText)
        .text(c.header, x + pad, hy + (height - h) / 2, { width: c.width - pad * 2, align: c.align });
      x += c.width;
    }
    return hy + height;
  };

  y = ensureSpace(doc, y, 60);
  y = drawHeader(y);
  rows.forEach((row, r) => {
    const bold = opts.boldLastRow && r === rows.length - 1;
    const fontFor = (i: number) => (bold || (opts.firstColumnBold && i === 0) ? "Helvetica-Bold" : "Helvetica");
    const heights = row.map((cell, i) =>
      doc
        .font(fontFor(i))
        .fontSize(9.5)
        .heightOfString(cell, { width: columns[i].width - pad * 2 }),
    );
    const height = Math.max(...heights) + 18;
    if (y + height > BOTTOM) {
      doc.addPage();
      y = drawHeader(PAGE.margin);
    }
    if (r % 2 === 1) doc.rect(PAGE.margin, y, CONTENT_WIDTH, height).fill(C.card);
    let x = PAGE.margin;
    row.forEach((cell, i) => {
      const c = columns[i];
      doc
        .font(fontFor(i))
        .fontSize(9.5)
        .fillColor(opts.columnColors?.[i] ?? (i === 0 ? C.ink : C.text))
        .text(cell, x + pad, y + (height - heights[i]) / 2, { width: c.width - pad * 2, align: c.align });
      x += c.width;
    });
    doc
      .moveTo(PAGE.margin, y + height)
      .lineTo(PAGE.margin + CONTENT_WIDTH, y + height)
      .lineWidth(0.5)
      .strokeColor(C.line)
      .stroke();
    y += height;
  });
  return y;
}

function drawExtras(
  doc: Doc,
  title: string,
  lines: InvoicePdfLine[],
  y: number,
  money: (v: number) => string,
  gold = false,
) {
  y = gold ? goldSectionTitle(doc, title, y) : sectionTitle(doc, title, y);
  const columns: Column[] = [
    { header: "DESCRIPTION", width: CONTENT_WIDTH - 130, align: "left" },
    { header: "AMOUNT", width: 130, align: "right" },
  ];
  return drawTable(
    doc,
    columns,
    lines.map((l) => [l.description, money(l.netAmount)]),
    y,
    gold ? { headerFill: "#111111", headerText: C.goldBright } : { headerFill: C.ink, headerText: "#ffffff" },
  );
}

function summaryRows(doc: Doc, y: number, rows: [string, string, { bold?: boolean; valueColor?: string }?][]) {
  y = ensureSpace(doc, y, rows.length * 22);
  const valueX = PAGE.margin + CONTENT_WIDTH - 120;
  for (const [label, value, style] of rows) {
    doc
      .font(style?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor(style?.bold ? C.ink : C.muted);
    doc.text(label, PAGE.margin, y, { width: valueX - PAGE.margin - 30, align: "right" });
    doc
      .font("Helvetica-Bold")
      .fillColor(style?.valueColor ?? C.ink)
      .text(value, valueX, y, { width: 112, align: "right" });
    y += 22;
  }
  return y;
}

function footer(doc: Doc, y: number, first: [string, boolean][], second: string) {
  // The footer may sit in the bottom margin rather than spill two lines onto a new page.
  const footerBottom = PAGE.height - 14;
  if (y + 30 > footerBottom) {
    doc.addPage();
    y = PAGE.margin;
  }
  doc.page.margins.bottom = 0;
  doc
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, y)
    .lineWidth(0.75)
    .strokeColor(C.line)
    .stroke();
  y += 14;
  doc.fontSize(9).fillColor(C.muted);
  const width = sum(first.map(([t, bold]) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").widthOfString(t)));
  let x = PAGE.margin + (CONTENT_WIDTH - width) / 2;
  for (const [text, bold] of first) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").text(text, x, y, { lineBreak: false });
    x += doc.widthOfString(text);
  }
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.faint)
    .text(second, PAGE.margin, y + 14, { width: CONTENT_WIDTH, align: "center" });
}

/** Big diagonal DRAFT / VOID mark on every page. */
function watermark(doc: Doc, status: string) {
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
      .fillColor(word === "VOID" ? C.red : C.faint)
      .fillOpacity(0.12)
      .text(word, 0, PAGE.height / 2 - 60, { width: PAGE.width, align: "center", lineBreak: false });
    doc.restore();
  }
}

function dashedLine(doc: Doc, x: number, y: number, w: number, color: string) {
  doc
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineWidth(0.75)
    .dash(3, { space: 3 })
    .strokeColor(color)
    .stroke()
    .undash();
}

function ensureSpace(doc: Doc, y: number, needed: number) {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return PAGE.margin;
}

// ---------------------------------------------------------------------------------------------
// Formatting.

const SYMBOLS: Record<string, string> = { PKR: "Rs. ", GBP: "£", USD: "$", EUR: "€", AUD: "A$", CAD: "C$" };

export function currencySymbol(currency: string) {
  return SYMBOLS[currency] ?? `${currency} `;
}

export function currencyLabel(currency: string) {
  return currency === "PKR" ? "PKR (Rs.)" : `${currency} (${currencySymbol(currency).trim()})`;
}

/** PKR drops ".00" like the samples (Rs. 1,683); other currencies always show pence/cents (£38.03). */
export function formatMoney(value: number, currency: string) {
  const v = round2(value);
  const digits =
    currency === "PKR"
      ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const text = Math.abs(v).toLocaleString("en-US", digits);
  return `${v < 0 ? "-" : ""}${currencySymbol(currency)}${text}`;
}

/** `utc` for date-only values (order dates), which are stored as UTC midnight. */
export function formatDate(date: Date, utc = false) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
}

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function monthYear(value: string) {
  return parseDateOnly(value).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function pct(percent: number | null | undefined, suffix = "") {
  return percent === null || percent === undefined ? "" : ` (${percent}%${suffix})`;
}

export function uniform(values: (number | null)[]): number | null {
  if (!values.length || values.some((v) => v === null)) return null;
  return values.every((v) => v === values[0]) ? values[0] : null;
}

export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}
