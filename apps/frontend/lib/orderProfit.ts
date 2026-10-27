/**
 * Live profit estimate for the order form — the same formulas as the backend's FinanceService.compute(), run on the
 * values currently in the form instead of an order's snapshots. All amounts in PKR. Prices not entered yet count as 0.
 */

export interface ProfitLineInput {
  quantity: number;
  /** STOCK: per-unit prices. */
  sellPrice?: number;
  buyPrice?: number;
  stockOwnerCost?: number;
  /** STOCK: the company's PROFIT_SHARE cut %, or 0 for FIXED Stock Owners. */
  companyCutPercent?: number;
  /** DROPSHIP: line totals (all units) — the client buying price and the company's buy price (the 3PL's less its %). */
  clientTotal?: number;
  buyTotal?: number;
}

export interface ProfitInput {
  dropship: boolean;
  lines: ProfitLineInput[];
  ebayNetProceeds: number;
  shippingCost: number;
  /** STOCK only: what the Account Holder is charged for the 3PL / what the 3PL is paid (0 without a 3PL). */
  threePlPriceCharged: number;
  threePlPayout: number;
  accountHolderSharePercent: number;
}

export interface ProfitEstimate {
  buyingPrice: number;
  /** 0 on dropship orders. */
  threePlPriceCharged: number;
  /** Order profit before it's split: payout − shipping − buying price − 3PL charge. */
  orderProfit: number;
  accountHolderShare: number;
  companyShare: number;
  productMarkup: number;
  stockOwnerCut: number;
  threePlMarkup: number;
  companyProfit: number;
}

/**
 * DROPSHIP 3PL discount (decided 2026-10-27; mirrors the backend's dropshipNetBuy): the company pays the 3PL its entered
 * buy price minus the order's 3PL discount % — the "admin buy price". Same currency as `buyTotal`.
 */
export function dropshipNetBuy(buyTotal: number, discountPercent: number | null | undefined): number {
  return round2(buyTotal * (1 - (discountPercent ?? 0) / 100));
}

/** The 3PL's buy price that gives this admin buy price (the admin can type either). */
export function dropshipGrossBuy(netBuy: number, discountPercent: number | null | undefined): number {
  const keep = 1 - (discountPercent ?? 0) / 100;
  return keep > 0 ? round2(netBuy / keep) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function estimateOrderProfit(input: ProfitInput): ProfitEstimate {
  let buyingPrice = 0;
  let productMarkup = 0;
  let stockOwnerCut = 0;
  for (const l of input.lines) {
    if (input.dropship) {
      const client = l.clientTotal ?? 0;
      buyingPrice += client;
      productMarkup += client - (l.buyTotal ?? 0);
      continue;
    }
    const sell = (l.sellPrice ?? 0) * l.quantity;
    const buy = (l.buyPrice ?? 0) * l.quantity;
    buyingPrice += sell;
    productMarkup += sell - buy;
    stockOwnerCut += ((l.companyCutPercent ?? 0) / 100) * ((l.buyPrice ?? 0) - (l.stockOwnerCost ?? 0)) * l.quantity;
  }
  // Dropship orders have no 3PL service charge, and the 3PL's payout (the buy prices) is already in the markup.
  const threePlPriceCharged = input.dropship ? 0 : input.threePlPriceCharged;
  const threePlMarkup = input.dropship ? 0 : threePlPriceCharged - input.threePlPayout;

  const orderProfit = input.ebayNetProceeds - input.shippingCost - buyingPrice - threePlPriceCharged;
  const accountHolderShare = orderProfit * (input.accountHolderSharePercent / 100);
  const companyShare = orderProfit - accountHolderShare;

  return {
    buyingPrice,
    threePlPriceCharged,
    orderProfit,
    accountHolderShare,
    companyShare,
    productMarkup,
    stockOwnerCut,
    threePlMarkup,
    companyProfit: companyShare + productMarkup + stockOwnerCut + threePlMarkup,
  };
}
