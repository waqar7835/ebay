import { BadRequestException } from "@nestjs/common";
import { Currency, ExchangeRates } from "@ebay-order-management/shared";

/**
 * Amounts are entered in each party's own currency (the *Original fields) and stored converted to
 * PKR (the plain / *Snapshot fields) with the rates locked on the order. A null currency marks an
 * amount from before currencies existed — it's already PKR and is left as-is.
 */
export interface OrderAmounts {
  accountHolderCurrency: Currency | null;
  threePlCurrency: Currency | null;
  ebayNetProceeds: number;
  ebayNetProceedsOriginal: number | null;
  shippingCost: number;
  shippingCostOriginal: number | null;
  threePlPriceChargedSnapshot: number | null;
  threePlPriceChargedOriginal: number | null;
  threePlPayoutSnapshot: number | null;
  threePlPayoutOriginal: number | null;
}

export interface ItemAmounts {
  currency: Currency | null;
  sellPriceSnapshot: number | null;
  sellPriceOriginal: number | null;
  buyPriceSnapshot: number | null;
  buyPriceOriginal: number | null;
  stockOwnerCostSnapshot: number | null;
  stockOwnerCostOriginal: number | null;
}

/** Every currency the order's amounts are entered in (each needs a rate). */
export function orderCurrencies(order: OrderAmounts, items: ItemAmounts[]): Set<Currency> {
  const currencies = new Set<Currency>();
  if (order.accountHolderCurrency) currencies.add(order.accountHolderCurrency);
  if (order.threePlCurrency) currencies.add(order.threePlCurrency);
  for (const item of items) if (item.currency) currencies.add(item.currency);
  return currencies;
}

/** Re-derives every PKR amount from its original with the given rates. */
export function convertOrderAmounts(order: OrderAmounts, items: ItemAmounts[], rates: ExchangeRates) {
  if (order.accountHolderCurrency) {
    const c = order.accountHolderCurrency;
    order.ebayNetProceeds = toPkr(order.ebayNetProceedsOriginal, c, rates) ?? 0;
    order.shippingCost = toPkr(order.shippingCostOriginal, c, rates) ?? 0;
    order.threePlPriceChargedSnapshot = toPkr(order.threePlPriceChargedOriginal, c, rates);
  }
  if (order.threePlCurrency) {
    order.threePlPayoutSnapshot = toPkr(order.threePlPayoutOriginal, order.threePlCurrency, rates);
  }
  for (const item of items) {
    if (!item.currency) continue;
    item.sellPriceSnapshot = toPkr(item.sellPriceOriginal, item.currency, rates);
    item.buyPriceSnapshot = toPkr(item.buyPriceOriginal, item.currency, rates);
    item.stockOwnerCostSnapshot = toPkr(item.stockOwnerCostOriginal, item.currency, rates);
  }
}

/**
 * For an order from before currencies: the stored amounts become the "originals" and each party's
 * currency is taken from the user as they are now — so a recalculation reads them in that currency.
 */
export function adoptLegacyAmounts(
  order: OrderAmounts,
  items: (ItemAmounts & { stockOwnerId: string | null })[],
  currencyOf: (party: "accountHolder" | "threePl" | { stockOwnerId: string }) => Currency | null,
) {
  if (!order.accountHolderCurrency) {
    order.accountHolderCurrency = currencyOf("accountHolder");
    order.ebayNetProceedsOriginal = order.ebayNetProceeds;
    order.shippingCostOriginal = order.shippingCost;
    order.threePlPriceChargedOriginal = order.threePlPriceChargedSnapshot;
  }
  if (!order.threePlCurrency) {
    order.threePlCurrency = currencyOf("threePl");
    order.threePlPayoutOriginal = order.threePlPayoutSnapshot;
  }
  for (const item of items) {
    if (item.currency) continue;
    // A DROPSHIP item's only price is the buy price its 3PL entered, in the 3PL's currency.
    item.currency = item.stockOwnerId
      ? currencyOf({ stockOwnerId: item.stockOwnerId })
      : item.buyPriceSnapshot != null
        ? order.threePlCurrency
        : null;
    item.sellPriceOriginal = item.sellPriceSnapshot;
    item.buyPriceOriginal = item.buyPriceSnapshot;
    item.stockOwnerCostOriginal = item.stockOwnerCostSnapshot;
  }
}

/** Undoes adoptLegacyAmounts for an order that stays pre-currency: originals become the PKR amounts again. */
export function keepLegacyAmounts(order: OrderAmounts, items: ItemAmounts[]) {
  order.ebayNetProceeds = order.ebayNetProceedsOriginal ?? order.ebayNetProceeds;
  order.shippingCost = order.shippingCostOriginal ?? order.shippingCost;
  order.threePlPriceChargedSnapshot = order.threePlPriceChargedOriginal;
  order.threePlPayoutSnapshot = order.threePlPayoutOriginal;
  order.accountHolderCurrency = null;
  order.threePlCurrency = null;
  order.ebayNetProceedsOriginal = null;
  order.shippingCostOriginal = null;
  order.threePlPriceChargedOriginal = null;
  order.threePlPayoutOriginal = null;
  for (const item of items) {
    item.sellPriceSnapshot = item.sellPriceOriginal;
    item.buyPriceSnapshot = item.buyPriceOriginal;
    item.stockOwnerCostSnapshot = item.stockOwnerCostOriginal;
    item.currency = null;
    item.sellPriceOriginal = null;
    item.buyPriceOriginal = null;
    item.stockOwnerCostOriginal = null;
  }
}

/** Only positive rates for known currencies are accepted from the client. */
export function cleanManualRates(input: ExchangeRates | undefined): ExchangeRates {
  const rates: ExchangeRates = {};
  for (const [currency, rate] of Object.entries(input ?? {})) {
    if (!Object.values(Currency).includes(currency as Currency)) {
      throw new BadRequestException(`Unknown currency ${currency}`);
    }
    if (typeof rate !== "number" || !(rate > 0)) {
      throw new BadRequestException(`The exchange rate for ${currency} must be a positive number`);
    }
    rates[currency as Currency] = rate;
  }
  return rates;
}

function toPkr(amount: number | null, currency: Currency, rates: ExchangeRates): number | null {
  if (amount == null) return null;
  const rate = rates[currency];
  if (!rate) throw new BadRequestException(`No exchange rate for ${currency}`);
  return Math.round(amount * rate * 100) / 100;
}
