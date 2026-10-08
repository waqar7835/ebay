"use client";

import type {
  Currency,
  ExchangeRateDto,
  ExchangeRates,
  OrderDto,
  OrderStatus,
  ProductDto,
  ProductFulfillmentType,
} from "@ebay-order-management/shared";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Table,
  type TableColumnsType,
} from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { EditAction } from "@/components/RowActions";
import DateField from "@/components/DateField";
import ProductThumb from "@/components/ProductThumb";
import {
  createOrder,
  getToken,
  listExchangeRates,
  listOrders,
  listProducts,
  listUsers,
  updateOrder,
  updateOrderStatus,
} from "@/lib/api";
import { currencySymbol, money, pkr } from "@/lib/currency";
import { searchable, userNameOptions } from "@/lib/selectOptions";
import { formatDate } from "@/lib/date";

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

const SOURCE_LABEL: Record<string, string> = {
  STOCK: "Stock",
  DROPSHIP: "AliExpress",
};

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
  currency: Currency;
  threePlProfile: { fulfillmentType: ProductFulfillmentType } | null;
}

function todayIsoDate() {
  // Local date parts: toISOString() gives yesterday's date east of UTC in the early-morning hours.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface OrderFormValues {
  accountHolderId?: string;
  // All STOCK (at the same 3PL, which comes from the products) or all DROPSHIP (3PL picked below, optional).
  // buyTotal: dropship only — what the 3PL pays for the line (all units), in the 3PL's currency; optional.
  // clientTotal: dropship only — what the Account Holder is charged for the line (all units), in their currency; optional.
  items: { productId?: string; quantity: number; buyTotal?: number | null; clientTotal?: number | null }[];
  threePlId?: string;
  orderDate: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost: number;
  supplierUrl?: string;
}

const emptyForm = (): OrderFormValues => ({
  accountHolderId: undefined,
  items: [{ quantity: 1 }],
  threePlId: undefined,
  orderDate: todayIsoDate(),
  ebayOrderRef: "",
  trackingNumber: "",
  buyerDetails: "",
  ebayNetProceeds: 0,
  shippingCost: 0,
  supplierUrl: "",
});

export default function OrdersPage() {
  const router = useRouter();
  const [form] = Form.useForm<OrderFormValues>();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveRates, setLiveRates] = useState<ExchangeRateDto[]>([]);
  // PKR per unit as shown in the rate inputs (prefilled from the live/saved rates, editable).
  const [rateInputs, setRateInputs] = useState<ExchangeRates>({});
  const [recalculate, setRecalculate] = useState(false);
  // An order is all-Stock or all-Dropship: picked on create, fixed on edit.
  const [mode, setMode] = useState<ProductFulfillmentType>("STOCK" as ProductFulfillmentType);

  function refresh() {
    listOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    refresh();
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers as never).catch(() => undefined);
    loadRates();
  }, [router]);

  function loadRates() {
    listExchangeRates()
      .then((rates) => {
        setLiveRates(rates);
        setRateInputs(Object.fromEntries(rates.filter((r) => r.rate != null).map((r) => [r.currency, r.rate])));
      })
      .catch(() => undefined);
  }

  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const productById = new Map(products.map((p) => [p.id, p]));
  const formRows: OrderFormValues["items"] = Form.useWatch("items", form) ?? [];
  const formProducts = formRows.map((r) => (r?.productId ? productById.get(r.productId) : undefined));
  const isDropship = mode === "DROPSHIP";
  const dropshipThreePls = users.filter((u) => u.roles.includes("THREE_PL") && u.threePlProfile?.fulfillmentType === "DROPSHIP");
  const formThreePlId: string | undefined = Form.useWatch("threePlId", form);
  const firstWarehouse = formProducts.find((p) => p?.fulfillmentType === "STOCK")?.threePlId;
  const mixedWarehouses = new Set(formProducts.filter((p) => p?.fulfillmentType === "STOCK").map((p) => p!.threePlId)).size > 1;
  const editingOrder = editingOrderId ? orders.find((o) => o.id === editingOrderId) : undefined;

  // --- Currencies: each party's amounts are in their own currency, converted to PKR on save. ---
  const userById = new Map(users.map((u) => [u.id, u]));
  const legacy = !!editingOrder && !editingOrder.exchangeRates; // created before currencies: plain PKR until recalculated
  const lockedRates = editingOrder?.exchangeRates ?? {};
  const formAccountHolderId: string | undefined = Form.useWatch("accountHolderId", form);
  const accountHolderChanged = !!editingOrder && formAccountHolderId !== editingOrder.accountHolderId;
  const ahCurrency: Currency | null | undefined =
    legacy && !recalculate && !accountHolderChanged
      ? null
      : editingOrder?.accountHolderCurrency && !accountHolderChanged
        ? editingOrder.accountHolderCurrency
        : formAccountHolderId
          ? userById.get(formAccountHolderId)?.currency
          : undefined;
  const threePlId = isDropship ? formThreePlId : firstWarehouse;
  // Dropship buy totals are entered in the order's 3PL's currency.
  const threePlCurrency: Currency | null | undefined = threePlId
    ? legacy && !recalculate && threePlId === editingOrder?.threePlId
      ? null
      : (threePlId === editingOrder?.threePlId && editingOrder.threePlCurrency) || userById.get(threePlId)?.currency
    : undefined;
  const neededCurrencies: Currency[] =
    legacy && !recalculate
      ? []
      : [
          ...new Set(
            [
              ahCurrency,
              threePlId ? (threePlId === editingOrder?.threePlId && editingOrder.threePlCurrency) || userById.get(threePlId)?.currency : undefined,
              ...formProducts.map((p) => (p ? (editingOrder?.items.find((i) => i.productId === p.id)?.currency ?? p.currency) : undefined)),
            ].filter((c): c is Currency => !!c),
          ),
        ];
  // Without "recalculate", an existing order keeps its locked rates; only currencies new to it take one from the form.
  const editableRate = (c: Currency) => !editingOrder || recalculate || legacy || lockedRates[c] == null;
  const rateFor = (c: Currency) => (editableRate(c) ? rateInputs[c] : lockedRates[c]);
  const missingRates = neededCurrencies.filter((c) => !rateFor(c));
  const liveByCurrency = new Map(liveRates.map((r) => [r.currency, r]));
  const ratesStale = neededCurrencies.some((c) => editableRate(c) && liveByCurrency.get(c)?.stale);

  /** Options for one item row: only the order's type; other rows' products hidden; Stock products must share a 3PL. */
  function productOptionsFor(index: number) {
    const others = formRows.map((r, i) => (i === index ? undefined : r?.productId)).filter(Boolean);
    return products
      .filter((p) => p.fulfillmentType === mode && !others.includes(p.id))
      .map((p) => ({
        value: p.id,
        label: `${p.sku} — ${p.title}`,
        disabled: !isDropship && others.length > 0 && !!firstWarehouse && p.threePlId !== firstWarehouse,
        product: p,
      }));
  }

  function handleModeChange(next: ProductFulfillmentType) {
    setMode(next);
    form.setFieldsValue({ items: [{ quantity: 1 }], threePlId: undefined, supplierUrl: "" });
  }

  function openForm(values: OrderFormValues, orderId: string | null, fulfillment = "STOCK" as ProductFulfillmentType) {
    setEditingOrderId(orderId);
    setMode(fulfillment);
    setFormError(null);
    setRecalculate(false);
    setShowForm(true);
    // Form mounts on the same tick it's shown; defer so setFieldsValue hits the mounted fields.
    setTimeout(() => form.setFieldsValue(values));
  }

  function openCreateForm() {
    openForm(emptyForm(), null);
  }

  function openEditForm(order: OrderDto) {
    openForm(
      {
        accountHolderId: order.accountHolderId,
        items: order.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          // As entered, in the 3PL's currency (plain PKR on orders from before currencies).
          buyTotal: i.buyTotalOriginal ?? i.buyTotalSnapshot,
          // As entered, in the Account Holder's currency.
          clientTotal: i.clientTotalOriginal ?? i.clientTotalSnapshot,
        })),
        threePlId: order.threePlId ?? undefined,
        orderDate: order.orderDate,
        ebayOrderRef: order.ebayOrderRef,
        trackingNumber: order.trackingNumber ?? "",
        buyerDetails: order.buyerDetails,
        // As entered, in the Account Holder's currency (plain PKR on orders from before currencies).
        ebayNetProceeds: order.ebayNetProceedsOriginal ?? order.ebayNetProceeds,
        shippingCost: order.shippingCostOriginal ?? order.shippingCost,
        supplierUrl: order.supplierUrl ?? "",
      },
      order.id,
      // Stock items always have a Stock Owner, dropship items never do.
      (order.items[0]?.stockOwnerId ? "STOCK" : "DROPSHIP") as ProductFulfillmentType,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingOrderId(null);
  }

  async function handleFinish(values: OrderFormValues) {
    if (mixedWarehouses) return;
    if (missingRates.length) {
      setFormError(`Enter the PKR exchange rate for ${missingRates.join(", ")}`);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const dropshipThreePlId = isDropship ? values.threePlId || undefined : undefined;
    const items = values.items.map((r) => ({
      productId: r.productId as string,
      quantity: Number(r.quantity),
      // Buy totals are in the 3PL's currency, so they only go with a 3PL.
      ...(isDropship
        ? {
            buyTotal: dropshipThreePlId && r.buyTotal != null ? Number(r.buyTotal) : null,
            clientTotal: r.clientTotal != null ? Number(r.clientTotal) : null,
          }
        : {}),
    }));
    // On edit, only send items when they changed — re-sending re-validates products already on the order.
    // A dropship order's new 3PL also re-sends the items, since their buy totals are in that 3PL's currency.
    const threePlChanged = isDropship && (!editingOrder || (dropshipThreePlId ?? null) !== editingOrder.threePlId);
    const itemsChanged =
      !editingOrder ||
      threePlChanged ||
      items.length !== editingOrder.items.length ||
      items.some(
        (r, i) =>
          r.productId !== editingOrder.items[i]?.productId ||
          r.quantity !== editingOrder.items[i]?.quantity ||
          (isDropship &&
            (r.buyTotal ?? null) !== (editingOrder.items[i]?.buyTotalOriginal ?? editingOrder.items[i]?.buyTotalSnapshot ?? null)) ||
          (isDropship &&
            (r.clientTotal ?? null) !==
              (editingOrder.items[i]?.clientTotalOriginal ?? editingOrder.items[i]?.clientTotalSnapshot ?? null)),
      );
    const common = {
      accountHolderId: values.accountHolderId as string,
      orderDate: values.orderDate,
      ebayOrderRef: values.ebayOrderRef,
      trackingNumber: values.trackingNumber || undefined,
      buyerDetails: values.buyerDetails,
      ebayNetProceeds: Number(values.ebayNetProceeds ?? 0),
      shippingCost: Number(values.shippingCost ?? 0),
      supplierUrl: values.supplierUrl || undefined,
      exchangeRates: Object.fromEntries(neededCurrencies.filter(editableRate).map((c) => [c, rateInputs[c]])),
      ...(dropshipThreePlId ? { threePlId: dropshipThreePlId } : {}),
    };
    try {
      if (editingOrderId) {
        await updateOrder(editingOrderId, {
          ...common,
          ...(itemsChanged ? { items } : {}),
          // Null clears a dropship order's 3PL (leaving it out would keep the old one).
          ...(isDropship && itemsChanged ? { threePlId: dropshipThreePlId ?? null } : {}),
          ...(recalculate ? { recalculateRates: true } : {}),
        });
      } else {
        await createOrder({ ...common, items });
      }
      closeForm();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    await updateOrderStatus(orderId, status);
    refresh();
  }

  const columns: TableColumnsType<OrderDto> = [
    {
      title: "Products",
      key: "products",
      render: (_, order) => (
        <div className="flex min-w-64 flex-col gap-2">
          {order.items.map((item) => {
            const product = productById.get(item.productId);
            return (
              <div key={item.id} className="flex items-center gap-3">
                <ProductThumb product={product} size={52} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{product?.title ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {product?.sku ?? "—"} · ×{item.quantity}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      title: "Source",
      key: "source",
      render: (_, o) => {
        const product = productById.get(o.items[0]?.productId ?? "");
        return product ? (SOURCE_LABEL[product.fulfillmentType] ?? product.fulfillmentType) : "—";
      },
    },
    { title: "Date", dataIndex: "orderDate", render: (v: string) => formatDate(v), sorter: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    { title: "Order #", dataIndex: "ebayOrderRef" },
    { title: "Tracking #", dataIndex: "trackingNumber", render: (v) => v ?? "—" },
    { title: "Qty", key: "qty", render: (_, o) => o.items.reduce((sum, i) => sum + i.quantity, 0) },
    // Order amounts are PKR (converted from each user's currency when the order was saved).
    { title: "Payout", dataIndex: "ebayNetProceeds", render: (v: number) => pkr(v) },
    {
      title: "Buy Price",
      key: "buyPrice",
      // Stock: buy price × qty; dropship: each line's buy total. Pending while a dropship line awaits its price.
      render: (_, o) => {
        const totals = o.items.map((i) => i.buyTotalSnapshot ?? (i.buyPriceSnapshot == null ? null : i.buyPriceSnapshot * i.quantity));
        return totals.some((t) => t == null) ? "Pending" : pkr(totals.reduce<number>((sum, t) => sum + t!, 0));
      },
    },
    {
      title: "Status",
      key: "status",
      render: (_, order) => (
        <Select
          size="small"
          value={order.status}
          onChange={(v) => handleStatusChange(order.id, v)}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          className="w-32"
        />
      ),
    },
    {
      key: "actions",
      render: (_, order) => (
        <EditAction onClick={() => openEditForm(order)} />
      ),
    },
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Orders</h1>
          <Button type={showForm ? "default" : "primary"} onClick={() => (showForm ? closeForm() : openCreateForm())}>
            {showForm ? "Cancel" : "New order"}
          </Button>
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        {showForm && (
          <Card className="mt-6" title={editingOrderId ? "Edit order" : "New order"}>
            <Form<OrderFormValues> form={form} layout="vertical" onFinish={handleFinish} initialValues={emptyForm()}>
              <div className="flex gap-3">
                <Form.Item name="orderDate" label="Order date" rules={[{ required: true }]} className="w-40">
                  <DateField allowClear={false} className="w-full" />
                </Form.Item>
                <Form.Item
                  name="accountHolderId"
                  label="Client (Account Holder)"
                  rules={[{ required: true, message: "Select a client" }]}
                  className="flex-1"
                >
                  <Select showSearch={searchable} placeholder="Select…" options={userNameOptions(accountHolders)} />
                </Form.Item>
              </div>

              <Form.Item label="Products" required tooltip="The 3PL fee is charged once per order, however many products it has">
                <Segmented<ProductFulfillmentType>
                  value={mode}
                  onChange={handleModeChange}
                  disabled={!!editingOrderId}
                  options={[
                    { value: "STOCK" as ProductFulfillmentType, label: "Stock products" },
                    { value: "DROPSHIP" as ProductFulfillmentType, label: "Dropshipping" },
                  ]}
                />
                <div className="mb-3 mt-1 text-xs text-slate-500">
                  {editingOrderId
                    ? "An order's type can't be changed after it's created."
                    : isDropship
                      ? "Pick any dropship products. Buy prices are optional — the 3PL can fill them in or correct them later."
                      : "Stock products can be combined when they're held at the same 3PL."}
                </div>
                {isDropship && (
                  <Form.Item
                    name="threePlId"
                    label="3PL (optional)"
                    tooltip="Buys and ships the products; the buy prices below are in this 3PL's currency"
                    extra={dropshipThreePls.length === 0 ? "No 3PL users are set up for Dropshipping fulfillment yet." : undefined}
                    className="mb-3 max-w-md"
                  >
                    <Select showSearch={searchable} allowClear placeholder="None" options={userNameOptions(dropshipThreePls)} />
                  </Form.Item>
                )}
                <Form.List name="items">
                  {(fields, { add, remove }) => (
                    <div className="flex flex-col gap-3">
                      {fields.map((field, index) => {
                        const product = formProducts[index];
                        return (
                          <div key={field.key} className="flex items-center gap-4 rounded-xl border border-slate-200 p-3">
                            <ProductThumb product={product} size={72} />
                            <div className="min-w-0 flex-1">
                              <Form.Item
                                name={[field.name, "productId"]}
                                rules={[{ required: true, message: "Select a product" }]}
                                className="mb-1"
                              >
                                <Select
                                  showSearch={searchable}
                                  placeholder="Select a product…"
                                  options={productOptionsFor(index)}
                                  optionRender={(option) => (
                                    <div className="flex items-center gap-3 py-1">
                                      <ProductThumb product={option.data.product as ProductDto} size={40} />
                                      <span className="truncate">{option.data.label}</span>
                                    </div>
                                  )}
                                />
                              </Form.Item>
                              {product && (
                                <div className="text-xs text-slate-500">
                                  {product.fulfillmentType === "STOCK" ? `${product.stockQuantity} on hand` : "Dropshipping"}
                                  {product.sellPrice != null && ` · Sell ${money(product.sellPrice, product.currency)} / unit`}
                                </div>
                              )}
                              {isDropship && (
                                <div className="mt-2 grid gap-x-3 sm:grid-cols-2">
                                  <Form.Item
                                    name={[field.name, "buyTotal"]}
                                    label="Buy price"
                                    tooltip="What the 3PL pays for all units, in the 3PL's currency. Needed before the order can be marked shipped."
                                    className="mb-0"
                                  >
                                    <InputNumber
                                      min={0}
                                      step={0.01}
                                      prefix={threePlCurrency !== undefined ? currencySymbol(threePlCurrency) : undefined}
                                      placeholder={threePlId ? "All units (optional)" : "Pick a 3PL first"}
                                      disabled={!threePlId}
                                      className="w-full"
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    name={[field.name, "clientTotal"]}
                                    label="Client buying price"
                                    tooltip="What the client (Account Holder) is charged for all units, in the client's currency. Needed before the client can be invoiced."
                                    className="mb-0"
                                  >
                                    <InputNumber
                                      min={0}
                                      step={0.01}
                                      prefix={ahCurrency !== undefined ? currencySymbol(ahCurrency) : undefined}
                                      placeholder={formAccountHolderId ? "All units (optional)" : "Pick a client first"}
                                      disabled={!formAccountHolderId}
                                      className="w-full"
                                    />
                                  </Form.Item>
                                </div>
                              )}
                            </div>
                            <Form.Item name={[field.name, "quantity"]} rules={[{ required: true, message: "Qty" }]} className="mb-0 w-24">
                              <InputNumber min={1} precision={0} prefix="×" className="w-full" />
                            </Form.Item>
                            {fields.length > 1 && (
                              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} title="Remove product" />
                            )}
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
              </Form.Item>

              <div className="flex gap-3">
                <Form.Item name="ebayOrderRef" label="eBay order number" rules={[{ required: true }]} className="flex-1">
                  <Input placeholder="eBay order number" />
                </Form.Item>
                <Form.Item name="trackingNumber" label="Tracking number" className="flex-1">
                  <Input placeholder="Tracking number" />
                </Form.Item>
              </div>

              <Form.Item name="buyerDetails" label="Buyer details (name, address, phone number)" rules={[{ required: true }]}>
                <Input.TextArea rows={4} placeholder={"Name\nAddress\nPhone number"} />
              </Form.Item>

              <div className="flex gap-3">
                <Form.Item name="ebayNetProceeds" label="Payout (net profit from eBay)" tooltip="In the client's currency" className="flex-1">
                  <InputNumber prefix={currencySymbol(ahCurrency)} step={0.01} className="w-full" />
                </Form.Item>
                <Form.Item name="shippingCost" label="Shipping label cost (optional)" tooltip="In the client's currency" className="flex-1">
                  <InputNumber prefix={currencySymbol(ahCurrency)} min={0} step={0.01} className="w-full" />
                </Form.Item>
              </div>

              <Form.Item label="Exchange rates (to PKR)" tooltip="Amounts are converted to PKR with these rates, locked on the order">
                {editingOrder && (
                  <Checkbox checked={recalculate} onChange={(e) => setRecalculate(e.target.checked)} className="mb-2">
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
                  <div className="text-sm text-slate-500">Pick a client and products to see the rates used.</div>
                ) : (
                  <>
                    {ratesStale && (
                      <Alert
                        type="warning"
                        showIcon
                        className="mb-2"
                        title="Live rates are unavailable — showing the last saved rate. Type in a current rate if you have one."
                      />
                    )}
                    <div className="flex flex-wrap gap-3">
                      {neededCurrencies.map((c) => {
                        const live = liveByCurrency.get(c);
                        const editable = editableRate(c);
                        return (
                          <div key={c} className="w-56">
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
                            <div className={`mt-1 text-xs ${editable && (live?.stale || live?.unavailable) ? "text-amber-600" : "text-slate-400"}`}>
                              {!editable
                                ? "Locked on this order"
                                : live?.unavailable
                                  ? "No rate available — enter it"
                                  : live?.stale
                                    ? "Saved rate (API down)"
                                    : "Live rate"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </Form.Item>

              {isDropship && (
                <Form.Item name="supplierUrl" label="Supplier/product listing URL (optional)">
                  <Input placeholder="https://…" />
                </Form.Item>
              )}

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting} disabled={mixedWarehouses}>
                {editingOrderId ? "Save changes" : "Create order"}
              </Button>
            </Form>
          </Card>
        )}

        <Table<OrderDto>
          className="mt-6"
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={orders}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No orders yet." }}
        />
      </main>
    </>
  );
}
