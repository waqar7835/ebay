"use client";

import type { OrderDto } from "@ebay-order-management/shared";
import { Checkbox, InputNumber, Radio } from "antd";
import { currencySymbol, money } from "@/lib/currency";

/**
 * Full refund (the whole eBay payout) or a partial one, in the order's Account Holder currency. `restock`: on a full
 * refund of a stock order, the product is coming back and goes back into stock.
 */
export interface RefundChoiceValue {
  partial: boolean;
  amount?: number;
  restock?: boolean;
}

export const FULL_REFUND: RefundChoiceValue = { partial: false, restock: false };

/** Dropship orders are always refunded in full (Stock items always have a Stock Owner, dropship items never do). */
export const isDropshipOrder = (o: OrderDto) => o.items.length > 0 && o.items.every((i) => !i.stockOwnerId);

/** The eBay payout as entered (Account Holder's currency; plain PKR on orders from before currencies). */
const payoutOf = (o: OrderDto) => o.ebayNetProceedsOriginal ?? o.ebayNetProceeds;

/** What to send as `refundAmount`: undefined = full; null = a partial refund still missing a valid amount. */
export function refundAmountFor(order: OrderDto, choice: RefundChoiceValue): number | undefined | null {
  if (!choice.partial) return undefined;
  if (choice.amount == null || choice.amount <= 0 || choice.amount > payoutOf(order)) return null;
  return choice.amount;
}

/** What to send as `restock`: only full refunds of stock orders can put the stock back. */
export function restockFor(order: OrderDto, choice: RefundChoiceValue): boolean | undefined {
  return !choice.partial && !isDropshipOrder(order) ? !!choice.restock : undefined;
}

export default function RefundChoice({
  order,
  value,
  onChange,
}: {
  order: OrderDto;
  value: RefundChoiceValue;
  onChange: (value: RefundChoiceValue) => void;
}) {
  const dropship = isDropshipOrder(order);
  const currency = order.ebayNetProceedsOriginal != null ? order.accountHolderCurrency : null;
  const payout = payoutOf(order);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-slate-500">
        Order {order.ebayOrderRef} · eBay payout {money(payout, currency)}
      </div>
      <Radio.Group
        value={value.partial ? "partial" : "full"}
        onChange={(e) => onChange({ ...value, partial: e.target.value === "partial" })}
        options={[
          { value: "full", label: "Full refund" },
          { value: "partial", label: "Partial refund", disabled: dropship },
        ]}
      />
      {dropship && <div className="text-xs text-slate-500">Dropship orders are always refunded in full.</div>}
      {!dropship && !value.partial && (
        <div>
          <Checkbox checked={!!value.restock} onChange={(e) => onChange({ ...value, restock: e.target.checked })}>
            The product is coming back — put it back into stock
          </Checkbox>
          <div className="text-xs text-slate-500">Leave unticked if the buyer keeps it; stock stays as it is.</div>
        </div>
      )}
      {value.partial && (
        <InputNumber
          autoFocus
          prefix={currencySymbol(currency)}
          min={0.01}
          max={payout}
          step={0.01}
          placeholder="Amount refunded to the buyer"
          value={value.amount ?? null}
          onChange={(v) => onChange({ ...value, partial: true, amount: v == null ? undefined : Number(v) })}
          status={refundAmountFor(order, value) === null ? "error" : undefined}
          className="w-64"
        />
      )}
    </div>
  );
}
