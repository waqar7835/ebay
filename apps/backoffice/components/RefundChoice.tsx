"use client";

import type { OrderDto } from "@ebay-order-management/shared";
import { InputNumber, Radio } from "antd";
import { currencySymbol, money } from "@/lib/currency";

/** Full refund (the whole eBay payout) or a partial one, in the order's Account Holder currency. */
export interface RefundChoiceValue {
  partial: boolean;
  amount?: number;
}

export const FULL_REFUND: RefundChoiceValue = { partial: false };

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
        onChange={(e) => onChange({ partial: e.target.value === "partial", amount: value.amount })}
        options={[
          { value: "full", label: "Full refund" },
          { value: "partial", label: "Partial refund", disabled: dropship },
        ]}
      />
      {dropship && <div className="text-xs text-slate-500">Dropship orders are always refunded in full.</div>}
      {value.partial && (
        <InputNumber
          autoFocus
          prefix={currencySymbol(currency)}
          min={0.01}
          max={payout}
          step={0.01}
          placeholder="Amount refunded to the buyer"
          value={value.amount ?? null}
          onChange={(v) => onChange({ partial: true, amount: v == null ? undefined : Number(v) })}
          status={refundAmountFor(order, value) === null ? "error" : undefined}
          className="w-64"
        />
      )}
    </div>
  );
}
