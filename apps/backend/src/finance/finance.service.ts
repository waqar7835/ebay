import { Injectable } from "@nestjs/common";
import { OrderFinancials, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";

@Injectable()
export class FinanceService {
  /**
   * Pure calculation over an order's snapshotted values — never re-reads live rates.
   * Product-side figures are summed over the order's items; the 3PL fee is per order, charged once.
   * DROPSHIP items have no Stock Owner or sell price; their buy price is a line total (buyTotalSnapshot,
   * entered by the admin or the 3PL, possibly not yet) — missing pieces are treated as 0. The
   * exact revenue-share formula for DROPSHIP orders is still to be finalized; this just keeps the
   * calculation from crashing on nulls in the meantime.
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
      const sell = item.sellPriceSnapshot ?? 0;
      const buy = item.buyPriceSnapshot ?? 0;
      productMarkup += sell * item.quantity - (item.buyTotalSnapshot ?? buy * item.quantity);
      sellTotal += sell * item.quantity;
      if (stockOwnerId && item.stockOwnerId !== stockOwnerId) continue;
      stockOwnerGross += buy * item.quantity;
      stockOwnerShareCut += itemShareCut(item);
    }
    const stockOwnerNet = stockOwnerGross - stockOwnerShareCut;

    const threePlPayout = order.threePlPayoutSnapshot ?? 0;
    const threePlPriceCharged = order.threePlPriceChargedSnapshot ?? 0;
    const threePlMarkup = order.threePlId ? threePlPriceCharged - threePlPayout : 0;

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
