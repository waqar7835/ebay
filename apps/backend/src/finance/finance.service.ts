import { Injectable } from "@nestjs/common";
import { OrderFinancials, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";

@Injectable()
export class FinanceService {
  /**
   * Pure calculation over an order's snapshotted values — never re-reads live rates.
   * Product-side figures are summed over the order's items; the 3PL fee is per order, charged once.
   *
   * DROPSHIP orders (decided 2026-10-08): each line has a buy price (buyTotalSnapshot — what the 3PL paid,
   * reimbursed to them as their whole payout) and a client buying price (clientTotalSnapshot — what the
   * Account Holder is charged, the dropship counterpart of a STOCK product's sell price). There's no 3PL
   * service charge or fee. So the Account Holder's profit subtracts the client prices, the company's
   * product markup is client price − buy price, and the 3PL payout isn't counted a second time as a
   * negative 3PL markup. Prices not entered yet count as 0.
   *
   * Pass `stockOwnerId` to get the stockOwner* figures for just that Stock Owner's items (for their
   * invoice/dashboard); every other figure always covers the whole order.
   */
  compute(order: Order, stockOwnerId?: string): OrderFinancials {
    const items = order.items ?? [];

    let productMarkup = 0;
    let sellTotal = 0;
    let stockOwnerGross = 0;
    let stockOwnerShareCut = 0;
    for (const item of items) {
      const buy = item.buyPriceSnapshot ?? 0;
      const lineSell = lineSellTotal(item);
      productMarkup += lineSell - (item.buyTotalSnapshot ?? buy * item.quantity);
      sellTotal += lineSell;
      if (stockOwnerId && item.stockOwnerId !== stockOwnerId) continue;
      stockOwnerGross += buy * item.quantity;
      stockOwnerShareCut += itemShareCut(item);
    }
    const stockOwnerNet = stockOwnerGross - stockOwnerShareCut;

    const threePlPayout = order.threePlPayoutSnapshot ?? 0;
    const threePlPriceCharged = order.threePlPriceChargedSnapshot ?? 0;
    // A dropship 3PL's payout is the buy prices, already taken off in productMarkup — not a fee.
    const threePlMarkup = !order.threePlId ? 0 : isDropshipOrder(order) ? threePlPriceCharged : threePlPriceCharged - threePlPayout;

    const accountHolderProfit = order.ebayNetProceeds - order.shippingCost - sellTotal - threePlPriceCharged;
    const accountHolderPayout = accountHolderProfit * (order.accountHolderSharePercentSnapshot / 100);
    const companyRemainderFromOrder = accountHolderProfit - accountHolderPayout;

    return {
      accountHolderProfit: round2(accountHolderProfit),
      accountHolderPayout: round2(accountHolderPayout),
      companyRemainderFromOrder: round2(companyRemainderFromOrder),
      productMarkup: round2(productMarkup),
      threePlMarkup: round2(threePlMarkup),
      stockOwnerGross: round2(stockOwnerGross),
      stockOwnerShareCut: round2(stockOwnerShareCut),
      stockOwnerNet: round2(stockOwnerNet),
      threePlPayout: round2(threePlPayout),
    };
  }

  /** What one item pays its Stock Owner: buyPrice × qty minus the company's profit-share cut. */
  stockOwnerItemNet(item: OrderItem): number {
    return round2((item.buyPriceSnapshot ?? 0) * item.quantity - itemShareCut(item));
  }

  /** Total company profit contribution from a single order (all four sources). */
  companyProfit(order: Order): number {
    const f = this.compute(order);
    return round2(f.productMarkup + f.threePlMarkup + f.companyRemainderFromOrder + f.stockOwnerShareCut);
  }
}

/** STOCK: sell price × qty; DROPSHIP: the line's client buying price. */
export function lineSellTotal(item: OrderItem): number {
  if (item.clientTotalSnapshot != null) return item.clientTotalSnapshot;
  return (item.sellPriceSnapshot ?? 0) * item.quantity;
}

/** STOCK items always have a Stock Owner; DROPSHIP items never do (an order is all one or the other). */
export function isDropshipOrder(order: Order): boolean {
  const items = order.items ?? [];
  return items.length > 0 && items.every((i) => !i.stockOwnerId);
}

/** Stock Owner PROFIT_SHARE: the company keeps sharePercent% of (buyPrice − stockOwnerCost) × qty. */
function itemShareCut(item: OrderItem): number {
  if (item.stockOwnerPayoutModeSnapshot !== StockOwnerPayoutMode.PROFIT_SHARE) return 0;
  const buy = item.buyPriceSnapshot ?? 0;
  const cost = item.stockOwnerCostSnapshot ?? 0;
  return ((item.stockOwnerSharePercentSnapshot ?? 0) / 100) * (buy - cost) * item.quantity;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
