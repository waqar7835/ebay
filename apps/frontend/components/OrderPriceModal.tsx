"use client";

import type { Currency, ExchangeRateDto, OrderDto, ProductDto } from "@ebay-order-management/shared";
import { InfoCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Form, InputNumber, Modal, Tag, Tooltip } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import ProfitRow from "@/components/ProfitRow";
import { listExchangeRates, updateOrder, type UpdateOrderPayload } from "@/lib/api";
import { currencySymbol, money, pkr } from "@/lib/currency";
import { estimateOrderProfit } from "@/lib/orderProfit";
import { productLabel } from "@/lib/productLabel";

interface PriceValues {
  ebayNetProceeds?: number | null;
  shippingCost?: number | null;
  /** DROPSHIP only, one per item: totals for all units. */
  items?: { buyTotal?: number | null; clientTotal?: number | null }[];
}

/**
 * Orders list (Admin / Staff who manage orders): double-click a price cell to edit the order's prices in place.
 * Editable: eBay payout + shipping (client's currency) and, on dropship orders, each line's buy price (3PL's currency)
 * and client buying price. Stock product prices are locked on the order at creation, so they're shown greyed out.
 * Saving goes through the normal order update, so it re-converts the order at today's rates like the Edit page does.
 * Invoiced orders (frozen) and orders from before currencies (need the Edit page's conversion) open read-only.
 */
export default function OrderPriceModal({
  order,
  productById,
  onClose,
  onSaved,
}: {
  order: OrderDto | null;
  productById: Map<string, ProductDto>;
  onClose: () => void;
  onSaved: (updated: OrderDto) => void;
}) {
  const [form] = Form.useForm<PriceValues>();
  const [liveRates, setLiveRates] = useState<ExchangeRateDto[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setError(null);
    form.setFieldsValue({
      ebayNetProceeds: order.ebayNetProceedsOriginal ?? order.ebayNetProceeds,
      shippingCost: order.shippingCostOriginal ?? order.shippingCost,
      items: order.items.map((i) => ({
        buyTotal: i.buyTotalOriginal ?? i.buyTotalSnapshot,
        clientTotal: i.clientTotalOriginal ?? i.clientTotalSnapshot,
      })),
    });
    listExchangeRates()
      .then(setLiveRates)
      .catch(() => setLiveRates([]));
  }, [order, form]);

  const values = Form.useWatch([], form) as PriceValues | undefined;
  if (!order) return null;

  // Before the products list has loaded, tell from the items: only stock lines carry a sell price.
  const firstProduct = productById.get(order.items[0]?.productId ?? "");
  const dropship = firstProduct
    ? firstProduct.fulfillmentType === "DROPSHIP"
    : order.items.every((i) => i.sellPriceOriginal == null && i.sellPriceSnapshot == null);
  const invoiced = !!(order.accountHolderInvoiceId || order.threePlInvoiceId || order.items.some((i) => i.stockOwnerInvoiceId));
  const legacy = !order.exchangeRates;
  const readOnly = invoiced || legacy;
  const ahCurrency = order.accountHolderCurrency;
  const threePlCurrency = order.threePlCurrency;

  // Saving converts with today's rates; a read-only order is shown with the rates it already has.
  const neededCurrencies = [
    ...new Set([ahCurrency, threePlCurrency, ...order.items.map((i) => i.currency)].filter((c): c is Currency => !!c)),
  ];
  const liveByCurrency = new Map((liveRates ?? []).map((r) => [r.currency, r]));
  const rateFor = (c: Currency): number | undefined =>
    readOnly ? (order.exchangeRates?.[c] ?? undefined) : (liveByCurrency.get(c)?.rate ?? undefined);
  const missingRates = liveRates ? neededCurrencies.filter((c) => !rateFor(c)) : [];
  const ratesReady = readOnly || (liveRates !== null && missingRates.length === 0);
  // PKR per unit; a missing currency means plain PKR (orders from before currencies).
  const toPkr = (amount: number | null | undefined, c: Currency | null | undefined) =>
    (amount ?? 0) * (c ? (rateFor(c) ?? 0) : 1);

  const lines = values?.items ?? [];
  const ebayNetProceeds = values?.ebayNetProceeds ?? 0;
  const shippingCost = values?.shippingCost ?? 0;
  const ahSharePercent = order.accountHolderSharePercentSnapshot;
  const profit = estimateOrderProfit({
    dropship,
    lines: order.items.map((item, i) => {
      if (dropship)
        return {
          quantity: item.quantity,
          clientTotal: toPkr(lines[i]?.clientTotal, ahCurrency),
          buyTotal: order.threePlId ? toPkr(lines[i]?.buyTotal, threePlCurrency) : 0,
        };
      const price = (original: number | null, snapshot: number | null) =>
        item.currency ? toPkr(original, item.currency) : (snapshot ?? 0);
      return {
        quantity: item.quantity,
        sellPrice: price(item.sellPriceOriginal, item.sellPriceSnapshot),
        buyPrice: price(item.buyPriceOriginal, item.buyPriceSnapshot),
        stockOwnerCost: price(item.stockOwnerCostOriginal, item.stockOwnerCostSnapshot),
        companyCutPercent: item.stockOwnerPayoutModeSnapshot === "PROFIT_SHARE" ? (item.stockOwnerSharePercentSnapshot ?? 0) : 0,
      };
    }),
    ebayNetProceeds: toPkr(ebayNetProceeds, ahCurrency),
    shippingCost: toPkr(shippingCost, ahCurrency),
    threePlPriceCharged: !order.threePlId
      ? 0
      : order.threePlPriceChargedOriginal != null
        ? toPkr(order.threePlPriceChargedOriginal, ahCurrency)
        : (order.threePlPriceChargedSnapshot ?? 0),
    threePlPayout: !order.threePlId
      ? 0
      : order.threePlPayoutOriginal != null
        ? toPkr(order.threePlPayoutOriginal, threePlCurrency)
        : (order.threePlPayoutSnapshot ?? 0),
    accountHolderSharePercent: ahSharePercent,
  });
  // Shown in the client's currency (the one the payout is typed in); PKR when it has none.
  const ahRate = ahCurrency ? rateFor(ahCurrency) : 1;
  const ahMoney = (pkrAmount: number) => {
    if (!ahRate) return "—";
    const v = pkrAmount / ahRate;
    return v < 0 ? `−${money(-v, ahCurrency)}` : money(v, ahCurrency);
  };
  const ahLess = (pkrAmount: number) => (Math.abs(pkrAmount) < 0.005 ? ahMoney(0) : ahMoney(-pkrAmount));

  async function handleSave() {
    if (!order) return;
    const v = form.getFieldsValue(true) as PriceValues;
    const payload: UpdateOrderPayload = {
      ebayNetProceeds: Number(v.ebayNetProceeds ?? 0),
      shippingCost: Number(v.shippingCost ?? 0),
    };
    if (dropship) {
      // Dropship line prices travel with the items (same product and qty, so nothing else changes).
      payload.items = order.items.map((item, i) => ({
        productId: item.productId,
        quantity: item.quantity,
        // Buy totals are in the 3PL's currency, so they only go with a 3PL.
        buyTotal: order.threePlId && v.items?.[i]?.buyTotal != null ? Number(v.items[i].buyTotal) : null,
        clientTotal: v.items?.[i]?.clientTotal != null ? Number(v.items[i].clientTotal) : null,
      }));
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateOrder(order.id, payload));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the prices");
    } finally {
      setSaving(false);
    }
  }

  const lockedTip = "Locked on the order when it was created — product price changes don't rewrite past orders";

  return (
    <Modal
      open
      title={`Prices — order #${order.ebayOrderRef}`}
      width={760}
      onCancel={() => !saving && onClose()}
      maskClosable={!saving}
      footer={
        readOnly
          ? [
              <Button key="close" onClick={onClose}>
                Close
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={onClose} disabled={saving}>
                Cancel
              </Button>,
              <Button key="save" type="primary" loading={saving} disabled={!ratesReady} onClick={handleSave}>
                Save prices
              </Button>,
            ]
      }
    >
      {invoiced && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="This order is on an invoice"
          description="Its prices are frozen. Delete or void that invoice first to change them."
        />
      )}
      {!invoiced && legacy && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title="Created before currencies"
          description={
            <>
              Open the <Link href={`/orders/${order.id}/edit`}>Edit page</Link> once to convert its amounts; after that its prices
              can be edited here.
            </>
          }
        />
      )}
      {!readOnly && missingRates.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title={`No exchange rate for ${missingRates.join(", ")} right now`}
          description={
            <>
              Type the rate in on the order&apos;s <Link href={`/orders/${order.id}/edit`}>Edit page</Link> to save it.
            </>
          }
        />
      )}
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}

      <Form form={form} layout="vertical" disabled={readOnly || saving}>
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Amounts</span>
              <Tag className="mr-0">{ahCurrency ?? "PKR"}</Tag>
            </div>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Form.Item name="ebayNetProceeds" label="eBay payout" tooltip="Net proceeds from eBay, in the client's currency">
                <InputNumber prefix={currencySymbol(ahCurrency)} step={0.01} className="w-full" />
              </Form.Item>
              <Form.Item name="shippingCost" label="Shipping label cost" tooltip="In the client's currency">
                <InputNumber prefix={currencySymbol(ahCurrency)} min={0} step={0.01} className="w-full" />
              </Form.Item>
            </div>

            <div className="mb-2 text-sm font-medium text-slate-700">Products</div>
            <div className="flex flex-col gap-3">
              {order.items.map((item, i) => {
                const product = productById.get(item.productId);
                return (
                  <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="mb-2 flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-slate-700">{product ? productLabel(product) : "Product"}</span>
                      <span className="shrink-0 text-slate-500">× {item.quantity}</span>
                    </div>
                    {dropship ? (
                      <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item
                          name={["items", i, "buyTotal"]}
                          label="Buy price"
                          tooltip="What the 3PL pays for all units of this product, in the 3PL's currency. Needed before the order can be marked shipped."
                          className="mb-0"
                        >
                          <InputNumber
                            min={0}
                            step={0.01}
                            prefix={currencySymbol(threePlCurrency)}
                            placeholder={order.threePlId ? "All units (optional)" : "No 3PL on this order"}
                            disabled={readOnly || saving || !order.threePlId}
                            className="w-full"
                          />
                        </Form.Item>
                        <Form.Item
                          name={["items", i, "clientTotal"]}
                          label="Client buying price"
                          tooltip="What the client is charged for all units of this product, in the client's currency. Needed before the client can be invoiced."
                          className="mb-0"
                        >
                          <InputNumber min={0} step={0.01} prefix={currencySymbol(ahCurrency)} placeholder="All units (optional)" className="w-full" />
                        </Form.Item>
                      </div>
                    ) : (
                      <div className="grid gap-x-3 sm:grid-cols-3">
                        {(
                          [
                            ["Sell price", item.sellPriceOriginal ?? item.sellPriceSnapshot],
                            ["Buy price", item.buyPriceOriginal ?? item.buyPriceSnapshot],
                            ["Cost", item.stockOwnerCostOriginal ?? item.stockOwnerCostSnapshot],
                          ] as const
                        ).map(([label, value]) => (
                          <Form.Item key={label} label={label} tooltip={lockedTip} className="mb-0">
                            <InputNumber value={value} prefix={currencySymbol(item.currency)} disabled className="w-full" />
                          </Form.Item>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:border-l md:border-slate-100 md:pl-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Profit estimate</span>
              <Tooltip title="Worked out live from these prices, the same way as the saved order. Amounts not entered yet count as 0; Staff revenue share isn't taken off.">
                <InfoCircleOutlined className="text-slate-400" />
              </Tooltip>
            </div>
            {!ratesReady ? (
              <p className="mb-0 text-xs text-slate-500">
                {liveRates === null ? "Loading exchange rates…" : `No exchange rate for ${missingRates.join(", ")}.`}
              </p>
            ) : (
              <>
                <dl className="mb-0 flex flex-col gap-1 text-sm">
                  <ProfitRow label="eBay payout" value={ahMoney(toPkr(ebayNetProceeds, ahCurrency))} />
                  {shippingCost > 0 && <ProfitRow label="Shipping label" value={ahLess(toPkr(shippingCost, ahCurrency))} />}
                  <ProfitRow label={dropship ? "Client buying price" : "Buying price"} value={ahLess(profit.buyingPrice)} />
                  {!dropship && <ProfitRow label="3PL charge" value={ahLess(profit.threePlPriceCharged)} />}
                  <ProfitRow label="Order profit" value={ahMoney(profit.orderProfit)} amount={profit.orderProfit} strong divider />
                  <ProfitRow label={`Client share (${ahSharePercent}%)`} value={ahMoney(profit.accountHolderShare)} />
                  <ProfitRow label={`Company share (${100 - ahSharePercent}%)`} value={ahMoney(profit.companyShare)} />
                  <ProfitRow label="Product markup" value={ahMoney(profit.productMarkup)} />
                  {profit.stockOwnerCut !== 0 && <ProfitRow label="Stock Owner profit share" value={ahMoney(profit.stockOwnerCut)} />}
                  {!dropship && <ProfitRow label="3PL markup" value={ahMoney(profit.threePlMarkup)} />}
                  <ProfitRow label="Company profit" value={ahMoney(profit.companyProfit)} amount={profit.companyProfit} strong divider />
                  {ahCurrency && <div className="text-right text-xs text-slate-400">≈ {pkr(profit.companyProfit)}</div>}
                </dl>
                {neededCurrencies.length > 0 && (
                  <p className="mb-0 mt-3 text-xs text-slate-400">
                    {readOnly ? "Rates on the order" : "Saving converts at today's rates"}:{" "}
                    {neededCurrencies.map((c) => `1 ${c} = Rs ${rateFor(c)?.toFixed(2)}`).join(" · ")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </Form>
    </Modal>
  );
}
