import { Injectable } from "@nestjs/common";
import { OrderFinancials, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { Order } from "../database/models/order.model";

@Injectable()
export class FinanceService {
  /** Pure calculation over an order's snapshotted values — never re-reads live rates. */
  compute(order: Order): OrderFinancials {
    const qty = order.quantity;

    const productMarkup = (order.sellPriceSnapshot - order.buyPriceSnapshot) * qty;
    const stockOwnerGross = order.buyPriceSnapshot * qty;
    const stockOwnerShareCut =
      order.stockOwnerPayoutModeSnapshot === StockOwnerPayoutMode.PROFIT_SHARE
        ? ((order.stockOwnerSharePercentSnapshot ?? 0) / 100) *
          (order.buyPriceSnapshot - order.stockOwnerCostSnapshot) *
          qty
        : 0;
    const stockOwnerNet = stockOwnerGross - stockOwnerShareCut;

    const threePlPayout = order.threePlPayoutSnapshot ?? 0;
    const threePlPriceCharged = order.threePlPriceChargedSnapshot ?? 0;
    const threePlMarkup = order.threePlId ? threePlPriceCharged - threePlPayout : 0;

    const accountHolderProfit =
      order.ebayNetProceeds - order.shippingCost - order.sellPriceSnapshot * qty - threePlPriceCharged;
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

  /** Total company profit contribution from a single order (all four sources). */
  companyProfit(order: Order): number {
    const f = this.compute(order);
    return round2(f.productMarkup + f.threePlMarkup + f.companyRemainderFromOrder + f.stockOwnerShareCut);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
