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
  /** DROPSHIP: line totals (all units) — the client buying price and the 3PL's buy price. */
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
