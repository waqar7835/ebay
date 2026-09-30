import { InvoiceLineKind, OrderStatus, ProductFulfillmentType, Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import type { InvoicePdfLine } from "../invoice-pdf";
import { round2, sum } from "../invoice-pdf";

/**
 * Made-up invoice content for the template editor's live preview — realistic enough (several
 * products, an adjustment line) to show how a layout handles a typical invoice.
 */
export type SampleRole = Role.ACCOUNT_HOLDER | Role.STOCK_OWNER | Role.THREE_PL;

export function sampleInvoice(role: SampleRole) {
  if (role === Role.ACCOUNT_HOLDER) return accountHolderSample();
  return role === Role.THREE_PL ? threePlSample() : stockOwnerSample();
}

const PRODUCTS = [
  "Wireless Earbuds Pro X2",
  "Stainless Steel Water Bottle 1L",
  "LED Desk Lamp (Dimmable)",
  "Phone Tripod with Remote",
  "Silicone Kitchen Utensil Set",
];

function stockOwnerSample() {
  const rows: [number, number, number][] = [
    [14, 2150, 3400],
    [22, 780, 1350],
    [9, 1900, 3100],
    [17, 950, 1650],
  ];
  const sharePercent = 40;
  const orders: InvoicePdfLine[] = rows.map(([quantity, cost, price], i) => {
    const profit = (price - cost) * quantity;
    const companyCut = round2((profit * sharePercent) / 100);
    return {
      kind: InvoiceLineKind.ORDER,
      description: `Order 12-0${4410 + i}-88${310 + i}`,
      deductionAmount: companyCut,
      netAmount: round2(price * quantity - companyCut),
      details: {
        role: "STOCK_OWNER",
        orderRef: `12-0${4410 + i}-88${310 + i}`,
        orderDate: `2026-09-${String(3 + i * 6).padStart(2, "0")}`,
        products: [
          {
            productId: `sample-${i}`,
            title: PRODUCTS[i],
            quantity,
            cost,
            price,
            payoutMode: StockOwnerPayoutMode.PROFIT_SHARE,
            sharePercent,
          },
        ],
      },
    };
  });
  const misc: InvoicePdfLine = {
    kind: InvoiceLineKind.MISC,
    description: "Packaging material advance (deducted)",
    deductionAmount: 0,
    netAmount: -1500,
    details: null,
  };
  const lines = [...orders, misc];
  return { lines, currency: "PKR", partnerName: "Sample Stock Owner", totalAmount: round2(sum(lines.map((l) => l.netAmount))) };
}

function accountHolderSample() {
  // quantity, selling, buying, 3PL, shipping (GBP)
  const rows: [number, number, number, number, number][] = [
    [6, 239.4, 108.6, 14.4, 0],
    [11, 197.89, 71.5, 26.4, 3.85],
    [4, 131.96, 58.4, 9.6, 0],
    [8, 143.92, 62.4, 19.2, 0],
    [5, 104.95, 41.25, 12, 0],
  ];
  const companySharePercent = 30;
  const orders: InvoicePdfLine[] = rows.map(([quantity, selling, buying, threePl, shipping], i) => {
    const profit = selling - buying - threePl - shipping;
    const companyShare = round2((profit * companySharePercent) / 100);
    return {
      kind: InvoiceLineKind.ORDER,
      description: `Order 12-1${1870 + i}-44${120 + i}`,
      deductionAmount: 0,
      netAmount: round2(companyShare + buying + threePl + shipping),
      details: {
        role: "ACCOUNT_HOLDER",
        orderRef: `12-1${1870 + i}-44${120 + i}`,
        orderDate: `2026-${i < 2 ? "08" : "09"}-${String(5 + i * 4).padStart(2, "0")}`,
        companySharePercent,
        products: [{ productId: `sample-${i}`, title: PRODUCTS[i], quantity, selling, buying, threePl, shipping }],
      },
    };
  });
  const refund: InvoicePdfLine = {
    kind: InvoiceLineKind.REFUND,
    description: "Refund adjustment — order 12-11873-44120 (refunded)",
    deductionAmount: 0,
    netAmount: -21.5,
    details: null,
  };
  const lines = [...orders, refund];
  return { lines, currency: "GBP", partnerName: "Sample Account Holder", totalAmount: round2(sum(lines.map((l) => l.netAmount))) };
}

function threePlSample() {
  // [fulfillment, products, tracking, status, amount (PKR)]
  const orders: [ProductFulfillmentType, [number, number][], string, OrderStatus, number][] = [
    [ProductFulfillmentType.STOCK, [[0, 2], [3, 1]], "RM482913056GB", OrderStatus.DELIVERED, 350],
    [ProductFulfillmentType.STOCK, [[2, 1]], "RM482913102GB", OrderStatus.DELIVERED, 350],
    [ProductFulfillmentType.STOCK, [[1, 3]], "1Z999AA10123456784", OrderStatus.SHIPPED, 350],
    [ProductFulfillmentType.DROPSHIP, [[4, 1]], "TBA304918822000", OrderStatus.DELIVERED, 2450],
    [ProductFulfillmentType.DROPSHIP, [[3, 2]], "TBA304918901000", OrderStatus.SHIPPED, 3300],
  ];
  const lines: InvoicePdfLine[] = orders.map(([fulfillment, products, trackingNumber, status, amount], i) => {
    const orderRef = `12-0${5520 + i}-71${400 + i}`;
    return {
      kind: InvoiceLineKind.ORDER,
      description: `Order ${orderRef}`,
      deductionAmount: 0,
      netAmount: amount,
      details: {
        role: "THREE_PL",
        orderRef,
        orderDate: `2026-09-${String(2 + i * 5).padStart(2, "0")}`,
        units: sum(products.map(([, q]) => q)),
        fulfillment,
        status,
        trackingNumber,
        products: products.map(([p, quantity]) => ({ title: PRODUCTS[p], quantity })),
      },
    };
  });
  lines.push({ kind: InvoiceLineKind.MISC, description: "Extra packaging (fragile items)", deductionAmount: 0, netAmount: 400, details: null });
  return { lines, currency: "PKR", partnerName: "Sample 3PL", totalAmount: round2(sum(lines.map((l) => l.netAmount))) };
}
