import { Order } from "../database/models/order.model";
import { itemShareCut, lineSellTotal } from "../finance/finance.service";

/**
 * Who gives back what when a shipped STOCK order is refunded (decided 2026-10-12). Pure, over the order's snapshots,
 * all in PKR.
 *
 * Full refund: every Stock Owner returns everything it was paid for its items; the company gives the Account Holder
 * back its profit share + the buying price, so the Account Holder carries only the 3PL charge + shipping (that part is
 * worked out on the Account Holder's invoice line, in their currency — see `accountHolderFullCredit`).
 *
 * Partial refund: the refund is used up in this order, each step split across lines by that line's amount:
 *   1. the company's product markup (sell − buy),
 *   2. the company's PROFIT_SHARE cut,
 *   3. the Stock Owner's profit share (buy − cut − cost) — the Account Holder sees steps 1–3 as "Stock Owner returns",
 *   4. the Account Holder + company profit (payout − shipping − sell − 3PL charge, floored at 0), split by share %,
 *   5. the product cost (the Stock Owner loses it),
 *   6. whatever is left, carried by the Account Holder alone.
 * The STOCK 3PL keeps its fee either way.
 */
export interface StockRefundSettlement {
  full: boolean;
  /** PKR each item's Stock Owner gives back, by order item id. */
  stockOwnerReturns: Map<string, number>;
  /** Partial refunds only: PKR the company credits the Account Holder. */
  accountHolderCredit: number;
}

export function isFullRefund(order: Order): boolean {
  if (order.refundAmountOriginal != null && order.ebayNetProceedsOriginal != null) {
    return order.refundAmountOriginal >= order.ebayNetProceedsOriginal;
  }
  return (order.refundAmount ?? order.ebayNetProceeds) >= order.ebayNetProceeds;
}

/** The refund in PKR at the order's current Account Holder rate (rates move until the order is invoiced). */
function refundPkr(order: Order): number {
  const rate = order.accountHolderCurrency ? order.exchangeRates?.[order.accountHolderCurrency] : undefined;
  if (order.refundAmountOriginal != null && rate) return order.refundAmountOriginal * rate;
  return order.refundAmount ?? order.ebayNetProceeds;
}

export function stockRefundSettlement(order: Order): StockRefundSettlement {
  const items = order.items ?? [];
  if (isFullRefund(order)) {
    const stockOwnerReturns = new Map(
      items.map((i) => [i.id, round2((i.buyPriceSnapshot ?? 0) * i.quantity - itemShareCut(i))]),
    );
    return { full: true, stockOwnerReturns, accountHolderCredit: 0 };
  }

  const lines = items.map((i) => {
    const sell = lineSellTotal(i);
    const buy = (i.buyPriceSnapshot ?? 0) * i.quantity;
    const cost = (i.stockOwnerCostSnapshot ?? 0) * i.quantity;
    const cut = itemShareCut(i);
    return {
      markup: Math.max(0, sell - buy),
      cut: Math.max(0, cut),
      soProfit: Math.max(0, buy - cut - cost),
      cost: Math.max(0, cost),
    };
  });

  let left = round2(refundPkr(order));
  /** Takes up to `left` from a pool spread over the lines, split by each line's amount. */
  const take = (amounts: number[]) => {
    const taken = allocate(Math.min(left, round2(sum(amounts))), amounts);
    left = round2(left - sum(taken));
    return taken;
  };

  const markup = take(lines.map((l) => l.markup));
  const cut = take(lines.map((l) => l.cut));
  const soProfit = take(lines.map((l) => l.soProfit));
  const sellTotal = sum(items.map(lineSellTotal));
  const profit = order.ebayNetProceeds - order.shippingCost - sellTotal - (order.threePlPriceChargedSnapshot ?? 0);
  const [profitTaken] = take([Math.max(0, round2(profit))]);
  const companyProfitTaken = round2(profitTaken * ((100 - order.accountHolderSharePercentSnapshot) / 100));
  const cost = take(lines.map((l) => l.cost));

  const stockOwnerReturns = new Map(items.map((item, i) => [item.id, round2(soProfit[i] + cost[i])]));
  const accountHolderCredit = round2(sum(markup) + sum(cut) + sum(soProfit) + sum(cost) + companyProfitTaken);
  return { full: false, stockOwnerReturns, accountHolderCredit };
}

/**
 * What the company gives the Account Holder back on a full STOCK refund, or any DROPSHIP refund: everything they paid
 * on the order's invoice line except the 3PL charge and shipping, which they still owe.
 */
export function accountHolderFullCredit(lineNet: number, threePl: number, shipping: number): number {
  return Math.max(0, round2(lineNet - threePl - shipping));
}

/** Splits `total` across `weights`, rounded to 2 decimals, with the rounding remainder on the last non-zero weight. */
function allocate(total: number, weights: number[]): number[] {
  const whole = sum(weights);
  if (!weights.length || whole <= 0 || total <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => round2((total * w) / whole));
  const last = weights.map((w) => w > 0).lastIndexOf(true);
  shares[last] = round2(total - sum(shares.filter((_, i) => i !== last)));
  return shares;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
