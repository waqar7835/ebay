"use client";

import type {
  Currency,
  ExchangeRateDto,
  ExchangeRates,
  OrderDto,
  OrderItemInput,
  ProductDto,
  ProductFulfillmentType,
  UserDto,
} from "@ebay-order-management/shared";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Segmented, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import DateField from "@/components/DateField";
import FileUpload from "@/components/FileUpload";
import ProductThumb from "@/components/ProductThumb";
import { listExchangeRates, listProducts, listUsers, localDateOnly, mediaUrl, type UpdateOrderPayload } from "@/lib/api";
import { currencySymbol, money, pkr } from "@/lib/currency";
import { searchable, userOptions } from "@/lib/selectOptions";
import { formatDate } from "@/lib/date";

interface OrderFormProps {
  // Prefills the form for editing; omitted when creating.
  initial?: OrderDto;
  submitLabel: string;
  submittingLabel: string;
  // On edit, `items`/`threePlId` are only included when they changed (see handleFinish).
  onSubmit: (payload: UpdateOrderPayload, shippingLabel: File | null) => Promise<void>;
}

interface ItemRow {
  productId?: string;
  quantity: number;
  /** Dropship only: what the 3PL pays for this line (all units), in the 3PL's currency. Optional. */
  buyTotal?: number | null;
}

interface OrderFormValues {
  orderDate: string;
  accountHolderId: string;
  items: ItemRow[];
  threePlId?: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost: number;
  supplierUrl?: string;
  comments?: string;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Shared by /orders/new and /orders/[id]/edit so both stay field-for-field identical. */
export default function OrderForm({ initial, submitLabel, submittingLabel, onSubmit }: OrderFormProps) {
  const [form] = Form.useForm<OrderFormValues>();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shippingLabel, setShippingLabel] = useState<File | null>(null);
  const [liveRates, setLiveRates] = useState<ExchangeRateDto[]>([]);
  const [ratesError, setRatesError] = useState<string | null>(null);
  // PKR per unit, as shown in the rate inputs (prefilled from the live/saved rates, editable by the admin).
  const [rateInputs, setRateInputs] = useState<ExchangeRates>({});
  const [recalculate, setRecalculate] = useState(false);
  // An order is all-Stock or all-Dropship, picked on create and fixed afterwards (Stock items always
  // have a Stock Owner, dropship items never do).
  const [mode, setMode] = useState<ProductFulfillmentType>(
    (initial ? (initial.items[0]?.stockOwnerId ? "STOCK" : "DROPSHIP") : "STOCK") as ProductFulfillmentType,
  );

  useEffect(() => {
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers).catch(() => undefined);
    loadRates();
  }, []);

  function loadRates() {
    setRatesError(null);
    listExchangeRates()
      .then((rates) => {
        setLiveRates(rates);
        setRateInputs((prev) => {
          const next = { ...prev };
          for (const r of rates) if (next[r.currency] == null && r.rate != null) next[r.currency] = r.rate;
          return next;
        });
      })
      .catch((err) => setRatesError(err instanceof Error ? err.message : "Failed to load exchange rates"));
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER" as never));

  const rows: ItemRow[] = Form.useWatch("items", form) ?? [];
  const selected = rows.map((r) => (r?.productId ? productById.get(r.productId) : undefined));
  const chosen = selected.filter((p): p is ProductDto => !!p);
  const isDropship = mode === "DROPSHIP";
  const warehouses = new Set(chosen.filter((p) => p.fulfillmentType === "STOCK").map((p) => p.threePlId).filter(Boolean));
  const mixedWarehouses = warehouses.size > 1;
  const unitCount = rows.reduce((sum, r) => sum + (r?.quantity ?? 0), 0);

  const eligibleThreePls = users.filter(
    (u) => u.roles.includes("THREE_PL" as never) && u.threePlProfile?.fulfillmentType === mode,
  );
  const userById = new Map(users.map((u) => [u.id, u]));

  // --- Currencies: each party's amounts are entered in their own currency, converted to PKR on save. ---
  const legacy = !!initial && !initial.exchangeRates; // created before currencies: plain PKR until recalculated
  const lockedRates = initial?.exchangeRates ?? {};
  const accountHolderId: string | undefined = Form.useWatch("accountHolderId", form) ?? initial?.accountHolderId;
  const threePlId: string | undefined = Form.useWatch("threePlId", form) ?? undefined;
  const accountHolderChanged = !!initial && accountHolderId !== initial.accountHolderId;
  const ahUserCurrency = accountHolderId ? userById.get(accountHolderId)?.currency : undefined;
  // Dropship buy totals are entered in the order's 3PL's currency.
  const threePlCurrency: Currency | null | undefined = threePlId
    ? legacy && !recalculate && threePlId === initial?.threePlId
      ? null
      : (threePlId === initial?.threePlId && initial.threePlCurrency) || userById.get(threePlId)?.currency
    : undefined;
  const ahCurrency: Currency | null | undefined =
    legacy && !recalculate && !accountHolderChanged
      ? null
      : initial?.accountHolderCurrency && !accountHolderChanged
        ? initial.accountHolderCurrency
        : ahUserCurrency;
  const convertsToPkr = !legacy || recalculate;
  const neededCurrencies: Currency[] = convertsToPkr
    ? [
        ...new Set(
          [
            ahCurrency,
            threePlId ? (threePlId === initial?.threePlId && initial.threePlCurrency) || userById.get(threePlId)?.currency : undefined,
            ...chosen.map((p) => initial?.items.find((i) => i.productId === p.id)?.currency ?? p.currency),
          ].filter((c): c is Currency => !!c),
        ),
      ]
    : [];
  // Without "recalculate", an existing order keeps its locked rates; only currencies new to it take one from the form.
  const editableRate = (c: Currency) => !initial || recalculate || legacy || lockedRates[c] == null;
  const rateFor = (c: Currency) => (editableRate(c) ? rateInputs[c] : lockedRates[c]);
  const missingRates = neededCurrencies.filter((c) => !rateFor(c));
  const liveByCurrency = new Map(liveRates.map((r) => [r.currency, r]));
  const staleCurrencies = neededCurrencies.filter((c) => editableRate(c) && liveByCurrency.get(c)?.stale);
  const sellTotalPkr = rows.reduce((sum, r, i) => {
    const p = selected[i];
    if (!p?.sellPrice || !p.currency) return sum;
    return sum + p.sellPrice * (rateFor(p.currency) ?? 0) * (r?.quantity ?? 0);
  }, 0);

  const initialItems: ItemRow[] = initial?.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    // As entered (in the 3PL's currency; plain PKR on orders from before currencies).
    buyTotal: i.buyTotalOriginal ?? i.buyTotalSnapshot,
  })) ?? [{ quantity: 1 }];
  const itemsChanged =
    !initial ||
    rows.length !== initial.items.length ||
    rows.some(
      (r, i) =>
        r?.productId !== initial.items[i]?.productId ||
        r?.quantity !== initial.items[i]?.quantity ||
        (isDropship && (r?.buyTotal ?? null) !== (initialItems[i]?.buyTotal ?? null)),
    );
  const addedProduct = !!initial && rows.some((r) => r?.productId && !initial.items.some((i) => i.productId === r.productId));

  /** Options for one row: only products of the order's type; other rows' products are hidden; Stock products must share a 3PL. */
  function optionsFor(index: number) {
    const others = rows.map((r, i) => (i === index ? undefined : r?.productId)).filter(Boolean);
    const otherProducts = others.map((id) => productById.get(id!)).filter((p): p is ProductDto => !!p);
    const otherWarehouse = otherProducts.find((p) => p.fulfillmentType === "STOCK")?.threePlId;
    return products
      .filter((p) => p.fulfillmentType === mode && !others.includes(p.id))
      .map((p) => {
        const reason = !isDropship && otherWarehouse && p.threePlId !== otherWarehouse ? "at another 3PL" : null;
        return { value: p.id, label: `${p.sku} — ${p.title}`, disabled: !!reason, reason, product: p };
      });
  }

  function handleModeChange(next: ProductFulfillmentType) {
    setMode(next);
    form.setFieldsValue({ items: [{ quantity: 1 }], threePlId: undefined, supplierUrl: "" });
  }

  function handleProductChange(index: number, productId: string) {
    const next = rows.map((r, i) => (i === index ? { ...r, productId } : r));
    const first = next.map((r) => (r?.productId ? productById.get(r.productId) : undefined)).find(Boolean);
    // Dropship orders keep whichever 3PL was picked; a Stock order ships from its products' 3PL.
    if (first?.fulfillmentType === "STOCK") form.setFieldValue("threePlId", first.threePlId ?? undefined);
  }

  async function handleFinish(values: OrderFormValues) {
    if (mixedWarehouses) return;
    if (missingRates.length) {
      setFormError(`Enter the PKR exchange rate for ${missingRates.join(", ")}`);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const threePlId = values.threePlId || undefined;
    const items: OrderItemInput[] = values.items.map((r) => ({
      productId: r.productId!,
      quantity: Number(r.quantity),
      // Buy totals are in the 3PL's currency, so they only go with a 3PL.
      ...(isDropship ? { buyTotal: threePlId && r.buyTotal != null ? Number(r.buyTotal) : null } : {}),
    }));
    // On edit only send what changed: re-sending items would re-validate products that haven't changed.
    // A dropship order's new 3PL also re-sends the items, since their buy totals are in that 3PL's currency.
    const threePlChanged = !initial || (threePlId ?? null) !== initial.threePlId;
    const sendItems = itemsChanged || (isDropship && threePlChanged);
    try {
      await onSubmit(
        {
          accountHolderId: values.accountHolderId,
          ...(sendItems ? { items } : {}),
          // Null clears a dropship order's 3PL (undefined would keep the old one).
          ...(sendItems || threePlChanged ? { threePlId: isDropship ? (threePlId ?? null) : threePlId } : {}),
          orderDate: values.orderDate,
          ebayOrderRef: values.ebayOrderRef,
          trackingNumber: values.trackingNumber || undefined,
          buyerDetails: values.buyerDetails,
          ebayNetProceeds: Number(values.ebayNetProceeds ?? 0),
          shippingCost: Number(values.shippingCost ?? 0),
          supplierUrl: values.supplierUrl || undefined,
          // "" clears the comments on edit.
          comments: values.comments ?? "",
          exchangeRates: Object.fromEntries(neededCurrencies.filter(editableRate).map((c) => [c, rateInputs[c]])),
          ...(initial && recalculate ? { recalculateRates: true } : {}),
        },
        shippingLabel,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save order");
      setSubmitting(false);
    }
  }

  // Dropship: shown above the product rows, since their buy prices are in the picked 3PL's currency.
  const threePlFields = (
    <div className={`grid gap-x-4 sm:grid-cols-2 ${isDropship ? "mb-4" : "mt-4"}`}>
      <Form.Item
        name="threePlId"
        label={`3PL ${isDropship ? "(optional)" : ""}`}
        tooltip={
          isDropship
            ? "Buys and ships the products; the buy prices below are in this 3PL's currency"
            : "The 3PL fee is charged once per order, however many products it has"
        }
        rules={[{ required: !isDropship, message: "Select a 3PL" }]}
        extra={
          eligibleThreePls.length === 0
            ? `No 3PL users are set up for ${isDropship ? "Dropshipping" : "Stock"} fulfillment yet.`
            : undefined
        }
        className="mb-0"
      >
        <Select
          showSearch={searchable}
          allowClear={isDropship}
          placeholder={isDropship ? "None" : "Select…"}
          options={userOptions(eligibleThreePls)}
        />
      </Form.Item>
      {isDropship && (
        <Form.Item name="supplierUrl" label="Supplier/product listing URL" className="mb-0">
          <Input placeholder="https://…" />
        </Form.Item>
      )}
    </div>
  );

  return (
    <Form<OrderFormValues>
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      className="mt-6"
      initialValues={{
        orderDate: initial?.orderDate ?? localDateOnly(),
        accountHolderId: initial?.accountHolderId,
        items: initialItems,
        threePlId: initial?.threePlId ?? undefined,
        ebayOrderRef: initial?.ebayOrderRef ?? "",
        trackingNumber: initial?.trackingNumber ?? "",
        buyerDetails: initial?.buyerDetails ?? "",
        // As entered, in the Account Holder's currency (plain PKR on orders from before currencies).
        ebayNetProceeds: initial ? (initial.ebayNetProceedsOriginal ?? initial.ebayNetProceeds) : 0,
        shippingCost: initial ? (initial.shippingCostOriginal ?? initial.shippingCost) : 0,
        supplierUrl: initial?.supplierUrl ?? "",
        comments: initial?.comments ?? "",
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Order details">
            <div className="grid gap-x-4 sm:grid-cols-3">
              <Form.Item name="orderDate" label="Order date" rules={[{ required: true }]}>
                <DateField allowClear={false} className="w-full" />
              </Form.Item>
              <Form.Item
                name="accountHolderId"
                label="Client (Account Holder)"
                rules={[{ required: true, message: "Select a client" }]}
                className="sm:col-span-2"
              >
                <Select showSearch={searchable} placeholder="Select…" options={userOptions(accountHolders)} />
              </Form.Item>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Form.Item name="ebayOrderRef" label="eBay order number" rules={[{ required: true }]} className="mb-0">
                <Input placeholder="eBay order number" />
              </Form.Item>
              <Form.Item name="trackingNumber" label="Tracking number" className="mb-0">
                <Input placeholder="Tracking number" />
              </Form.Item>
            </div>
          </Card>

          <Card
            title="Products"
            extra={unitCount > 0 && <Tag>{`${rows.length} product${rows.length === 1 ? "" : "s"} · ${unitCount} unit${unitCount === 1 ? "" : "s"}`}</Tag>}
          >
            <Segmented<ProductFulfillmentType>
              value={mode}
              onChange={handleModeChange}
              disabled={!!initial}
              options={[
                { value: "STOCK" as ProductFulfillmentType, label: "Stock products" },
                { value: "DROPSHIP" as ProductFulfillmentType, label: "Dropshipping" },
              ]}
              className="mb-1"
            />
            <p className="mb-4 mt-1 text-xs text-slate-500">
              {initial
                ? "An order's type can't be changed after it's created."
                : isDropship
                  ? "Pick any dropship products. Buy prices are optional — the 3PL can fill them in or correct them later."
                  : "Stock products can be combined when they're held at the same 3PL."}
            </p>
            {isDropship && threePlFields}
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => {
                    const product = selected[index];
                    return (
                      <div key={field.key} className="flex items-start gap-4 rounded-xl border border-slate-200 p-3">
                        <ProductThumb product={product} size={88} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-3">
                            <Form.Item
                              name={[field.name, "productId"]}
                              rules={[{ required: true, message: "Select a product" }]}
                              className="mb-0 min-w-0 flex-1"
                            >
                              <Select
                                showSearch={searchable}
                                placeholder="Select a product…"
                                options={optionsFor(index)}
                                onChange={(id: string) => handleProductChange(index, id)}
                                optionRender={(option) => {
                                  const p = option.data.product as ProductDto;
                                  return (
                                    <div className="flex items-center gap-3 py-1">
                                      <ProductThumb product={p} size={40} />
                                      <div className="min-w-0">
                                        <div className="truncate">{option.data.label}</div>
                                        <div className="text-xs text-slate-500">
                                          {p.fulfillmentType === "DROPSHIP" ? "Dropshipping" : `Stock · ${p.stockQuantity} on hand`}
                                          {option.data.reason ? ` · ${option.data.reason}` : ""}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                            </Form.Item>
                            <Form.Item name={[field.name, "quantity"]} rules={[{ required: true, message: "Qty" }]} className="mb-0 w-24">
                              <InputNumber min={1} precision={0} prefix="×" className="w-full" />
                            </Form.Item>
                            {isDropship && (
                              <Form.Item
                                name={[field.name, "buyTotal"]}
                                className="mb-0 w-36"
                                tooltip="Buy price for all units of this product"
                              >
                                <InputNumber
                                  min={0}
                                  step={0.01}
                                  prefix={threePlCurrency !== undefined ? currencySymbol(threePlCurrency) : undefined}
                                  placeholder={threePlId ? "Price (optional)" : "Pick a 3PL"}
                                  disabled={!threePlId}
                                  className="w-full"
                                />
                              </Form.Item>
                            )}
                            {fields.length > 1 && (
                              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} title="Remove product" />
                            )}
                          </div>
                          {product && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>
                                <Tag color={product.fulfillmentType === "DROPSHIP" ? "orange" : "blue"} className="mr-0">
                                  {product.fulfillmentType === "DROPSHIP" ? "Dropshipping" : "Stock"}
                                </Tag>
                              </span>
                              {product.size && <span>Size {product.size}</span>}
                              {product.fulfillmentType === "STOCK" && <span>{product.stockQuantity} on hand</span>}
                              {product.sellPrice != null && <span>Sell {money(product.sellPrice, product.currency)} / unit</span>}
                              {product.threePlId && <span>3PL: {userById.get(product.threePlId)?.name ?? userById.get(product.threePlId)?.email ?? "—"}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} block>
                    Add product
                  </Button>
                </div>
              )}
            </Form.List>

            {mixedWarehouses && (
              <Alert type="error" showIcon className="mt-3" title="These products are held at different 3PLs — an order can only ship from one 3PL." />
            )}
            {addedProduct && (
              <Alert
                type="info"
                showIcon
                className="mt-3"
                title="Newly added products copy their current prices and Stock Owner terms. Products already on the order keep theirs."
              />
            )}

            {!isDropship && chosen.length > 0 && threePlFields}
          </Card>

          <Card title="Buyer">
            <Form.Item name="buyerDetails" label="Name, address, phone number" rules={[{ required: true }]} className="mb-0">
              <Input.TextArea rows={5} placeholder={"Name\nAddress\nPhone number"} />
            </Form.Item>
          </Card>

          <Card title="Comments">
            <Form.Item
              name="comments"
              label="Notes for the 3PL"
              extra="Shown to the 3PL on their orders list. Account Holders and Stock Owners don't see it."
              className="mb-0"
            >
              <Input.TextArea rows={3} maxLength={2000} showCount placeholder="e.g. Gift wrap this order" />
            </Form.Item>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Amounts" extra={ahCurrency !== undefined && <Tag className="mr-0">{ahCurrency ?? "PKR"}</Tag>}>
            <Form.Item name="ebayNetProceeds" label="eBay payout" tooltip="Net proceeds from eBay, in the client's currency">
              <InputNumber prefix={currencySymbol(ahCurrency)} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="shippingCost" label="Shipping label cost" tooltip="In the client's currency" className="mb-3">
              <InputNumber prefix={currencySymbol(ahCurrency)} min={0} step={0.01} className="w-full" />
            </Form.Item>
            {!isDropship && chosen.length > 0 && convertsToPkr && missingRates.length === 0 && (
              <div className="flex justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
                <span>Products at sell price</span>
                <span className="font-medium text-slate-700">{pkr(sellTotalPkr)}</span>
              </div>
            )}
          </Card>

          <Card title="Exchange rates" extra={<Tag className="mr-0">to PKR</Tag>}>
            {initial && (
              <Checkbox checked={recalculate} onChange={(e) => setRecalculate(e.target.checked)} className="mb-3">
                Recalculate with today&apos;s rates
              </Checkbox>
            )}
            {legacy && !recalculate ? (
              <Alert
                type="info"
                showIcon
                title="Created before currencies — amounts are in PKR. Tick Recalculate to convert them from each user's currency."
              />
            ) : neededCurrencies.length === 0 ? (
              <p className="mb-0 text-sm text-slate-500">Pick a client and products to see the rates used.</p>
            ) : (
              <>
                {ratesError && (
                  <Alert type="warning" showIcon className="mb-3" title={ratesError} action={<Button size="small" onClick={loadRates}>Retry</Button>} />
                )}
                {staleCurrencies.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    className="mb-3"
                    title="Live rates are unavailable"
                    description="Showing the last saved rate — type in a current rate if you have one."
                  />
                )}
                <div className="flex flex-col gap-3">
                  {neededCurrencies.map((c) => {
                    const live = liveByCurrency.get(c);
                    const editable = editableRate(c);
                    const note = !editable
                      ? `Locked${initial?.exchangeRatesAt ? ` · ${formatDate(initial.exchangeRatesAt)}` : ""}`
                      : live?.unavailable
                        ? "No rate available — enter it"
                        : live?.fetchedAt
                          ? `${live.stale ? "Saved" : "Live"} · ${timeAgo(live.fetchedAt)}`
                          : "";
                    return (
                      <div key={c}>
                        <InputNumber
                          prefix={`1 ${c} = Rs`}
                          min={0.000001}
                          step={0.01}
                          className="w-full"
                          disabled={!editable}
                          status={editable && !rateInputs[c] ? "error" : undefined}
                          value={rateFor(c) ?? null}
                          onChange={(v) => setRateInputs((prev) => ({ ...prev, [c]: v == null ? undefined : Number(v) }))}
                        />
                        {note && (
                          <div className={`mt-1 text-xs ${editable && (live?.stale || live?.unavailable) ? "text-amber-600" : "text-slate-400"}`}>
                            {note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          <Card title="Shipping label">
            <FileUpload value={shippingLabel} onChange={setShippingLabel} accept="application/pdf" label="Select PDF" />
            {initial?.shippingLabelUrl && (
              <a href={mediaUrl(initial.shippingLabelUrl)} target="_blank" rel="noreferrer" className="mt-2 block text-sm">
                View current shipping label
              </a>
            )}
          </Card>

          <Card>
            {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={submitting} disabled={mixedWarehouses} block size="large">
              {submitting ? submittingLabel : submitLabel}
            </Button>
          </Card>
        </div>
      </div>
    </Form>
  );
}
