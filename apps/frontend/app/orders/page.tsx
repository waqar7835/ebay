"use client";

import { ProductFulfillmentType, Role, type Currency, type OrderDto, type OrderStatus, type ProductDto } from "@ebay-order-management/shared";
import { InfoCircleOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";
import { useEffect, useState, type Key } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import InvoiceStatusTags, { isInvoiced } from "@/components/InvoiceStatusTags";
import { EditAction } from "@/components/RowActions";
import { money as ownMoney, pkr } from "@/lib/currency";
import ProductThumb from "@/components/ProductThumb";
import ThreePlOrderModal from "@/components/ThreePlOrderModal";
import RefundChoice, { FULL_REFUND, refundAmountFor, type RefundChoiceValue } from "@/components/RefundChoice";
import StatusCounts, { STATUS_COLORS } from "@/components/StatusCounts";
import DateField from "@/components/DateField";
import {
  bulkUpdateOrderStatus,
  computeCurrentCycle,
  getMyCompany,
  getMyProfile,
  getStoredUser,
  getToken,
  listOrders,
  listProducts,
  listUsers,
  mediaUrl,
  updateOrderStatus,
} from "@/lib/api";
import { searchable, userLabel, userNameOptions } from "@/lib/selectOptions";
import { formatDate } from "@/lib/date";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

// Pseudo-status for the 3PL "No tracking #" card / filter: shipped or delivered but no tracking number entered yet.
const NO_TRACKING = "NO_TRACKING";
const needsTracking = (o: OrderDto) => (o.status === "SHIPPED" || o.status === "DELIVERED") && !o.trackingNumber?.trim();

const statusTag = (status: string) => <Tag color={STATUS_COLORS[status]}>{status}</Tag>;

const SOURCE_LABEL: Record<string, string> = {
  STOCK: "Stock",
  DROPSHIP: "AliExpress",
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{
    accountHolderId: string;
    threePlId: string;
    status: string;
    startDate: string;
    endDate: string;
    orderRef: string;
  }>({
    orderRef: "",
    accountHolderId: "",
    threePlId: "",
    status: "",
    startDate: "",
    endDate: "",
  });
  const [filterInit, setFilterInit] = useState(false);
  // Typed order number; copied into filter.orderRef after a short pause so each keystroke isn't a request.
  const [orderRefInput, setOrderRefInput] = useState("");
  // A DROPSHIP 3PL edits its orders (buy prices, supplier URL, tracking, mark shipped) in a popup.
  const [threePlEditing, setThreePlEditing] = useState<OrderDto | null>(null);
  // Order whose full comment is open in a popup.
  const [commentOrder, setCommentOrder] = useState<OrderDto | null>(null);
  // A 3PL enters dropship buy prices in their own currency; a STOCK 3PL has no buy prices at all.
  const [myCurrency, setMyCurrency] = useState<Currency | null>(null);
  const [myThreePlType, setMyThreePlType] = useState<ProductFulfillmentType | null>(null);

  const currentUser = getStoredUser();
  const isThreePl = currentUser?.roles.includes(Role.THREE_PL) ?? false;
  const isManager =
    currentUser?.roles.includes(Role.ADMIN) ||
    currentUser?.roles.includes(Role.STAFF) ||
    currentUser?.roles.includes(Role.SUPER_ADMIN) ||
    currentUser?.roles.includes(Role.PLATFORM_STAFF) ||
    !!currentUser?.staffPermissions?.canManageOrders;
  // Same test the backend uses to show a Stock Owner only their own items on an order.
  const isStockOwnerView =
    !isManager && !!currentUser?.roles.includes(Role.STOCK_OWNER) && !currentUser?.roles.includes(Role.ACCOUNT_HOLDER);
  const isAccountHolderView = !isManager && !!currentUser?.roles.includes(Role.ACCOUNT_HOLDER);
  // Admin and Staff who manage orders get status counts, read-only status tags and the bulk status bar.
  const canBulkEdit =
    (currentUser?.roles.includes(Role.ADMIN) ?? false) ||
    (!!currentUser?.roles.includes(Role.STAFF) && !!currentUser?.staffPermissions?.canManageOrders);
  // Creating needs canManageOrders (the API refuses everyone else), same test as the Orders nav link used to be.
  const canCreate = (currentUser?.roles.includes(Role.ADMIN) ?? false) || !!currentUser?.staffPermissions?.canManageOrders;
  // A 3PL gets the same, limited to what it may do anyway: mark its own PROCESSING orders SHIPPED.
  const threePlBulk = isThreePl && !canBulkEdit;
  const bulkMode = canBulkEdit || threePlBulk;
  const bulkStatuses = threePlBulk ? ["SHIPPED" as OrderStatus] : STATUSES;
  // 3PLs never see PENDING orders, so that count card is left out for them.
  // ...and get an extra "No tracking #" card.
  const countStatuses: string[] = threePlBulk ? [...STATUSES.filter((st) => st !== "PENDING"), NO_TRACKING] : STATUSES;
  const defaultBulkStatus = threePlBulk ? ("SHIPPED" as OrderStatus) : undefined;

  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | undefined>(defaultBulkStatus);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  // REFUNDED asks full or partial: in the bulk confirm popup when one order is selected, or in its own popup when a
  // Staff member picks it from the inline status dropdown.
  const [refundChoice, setRefundChoice] = useState<RefundChoiceValue>(FULL_REFUND);
  const [refundOrder, setRefundOrder] = useState<OrderDto | null>(null);
  const [refundSaving, setRefundSaving] = useState(false);

  function refresh(f = filter) {
    listOrders({
      // With an order number the API ignores every other filter and finds the order in any status or date.
      orderRef: f.orderRef.trim() || undefined,
      accountHolderId: f.accountHolderId || undefined,
      threePlId: f.threePlId || undefined,
      // Bulk mode filters status on the client so the counts above the table can cover every status.
      status: (bulkMode ? undefined : f.status || undefined) as OrderStatus | undefined,
      startDate: f.startDate || undefined,
      endDate: f.endDate || undefined,
    })
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers as never).catch(() => undefined);
    refresh(filter);
    if (isThreePl)
      getMyProfile()
        .then((me) => {
          setMyCurrency(me.currency);
          setMyThreePlType(me.threePlProfile?.fulfillmentType ?? null);
        })
        .catch(() => undefined);

    if (isManager) {
      getMyCompany()
        .then((company) => {
          const cycle = computeCurrentCycle(company.billingAnchorDay);
          setFilter((f) => ({ ...f, accountHolderId: "", threePlId: "", status: "", startDate: cycle.start, endDate: cycle.end }));
          setFilterInit(true);
        })
        .catch(() => setFilterInit(true));
    } else {
      setFilterInit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    setSelectedIds([]);
    if (filterInit) refresh(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.accountHolderId, filter.threePlId, filter.status, filter.startDate, filter.endDate, filter.orderRef]);

  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.orderRef === orderRefInput.trim() ? f : { ...f, orderRef: orderRefInput.trim() })), 400);
    return () => clearTimeout(t);
  }, [orderRefInput]);

  // An order number search overrides the other filters (they're shown disabled and not applied).
  const searchingRef = !!filter.orderRef;

  const productById = new Map(products.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  const matchesStatus = (o: OrderDto) => (filter.status === NO_TRACKING ? needsTracking(o) : o.status === filter.status);
  const visibleOrders = bulkMode && filter.status && !searchingRef ? orders.filter(matchesStatus) : orders;
  const statusCounts = new Map<string, number>(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]));
  if (isThreePl) statusCounts.set(NO_TRACKING, orders.filter(needsTracking).length);
  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id));
  // A partial refund is one order at a time; refunding several orders at once refunds each in full.
  const singleRefund = bulkStatus === "REFUNDED" && selectedOrders.length === 1 && selectedOrders[0].status !== "REFUNDED";
  const bulkRefundAmount = singleRefund ? refundAmountFor(selectedOrders[0], refundChoice) : undefined;

  async function handleBulkSave() {
    if (!bulkStatus || bulkRefundAmount === null) return;
    setBulkSaving(true);
    try {
      if (singleRefund) await updateOrderStatus(selectedOrders[0].id, bulkStatus, bulkRefundAmount);
      else await bulkUpdateOrderStatus(selectedOrders.map((o) => o.id), bulkStatus);
      setConfirmOpen(false);
      setSelectedIds([]);
      setBulkStatus(defaultBulkStatus);
      refresh();
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "Failed to update orders");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleStatusChange(order: OrderDto, status: OrderStatus) {
    if (status === "REFUNDED") {
      setRefundChoice(FULL_REFUND);
      setRefundOrder(order);
      return;
    }
    try {
      await updateOrderStatus(order.id, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the order");
    }
    refresh();
  }

  async function handleRefundSave() {
    if (!refundOrder) return;
    const amount = refundAmountFor(refundOrder, refundChoice);
    if (amount === null) return;
    setRefundSaving(true);
    try {
      await updateOrderStatus(refundOrder.id, "REFUNDED" as OrderStatus, amount);
      setRefundOrder(null);
      refresh();
    } catch (err) {
      setRefundOrder(null);
      setError(err instanceof Error ? err.message : "Failed to refund the order");
    } finally {
      setRefundSaving(false);
    }
  }

  function handlePrintLabel(shippingLabelUrl: string) {
    const win = window.open(mediaUrl(shippingLabelUrl), "_blank");
    if (win) {
      setTimeout(() => win.print(), 500);
    }
  }

  /**
   * Order amounts are stored in PKR (plus each party's amounts as entered). This list shows them in the viewer's
   * currency (decided 2026-10-08): Admin/Staff and the Account Holder see the order's Account Holder currency, converted
   * with the rate locked on the order; orders from before currencies (no rates) stay in PKR.
   */
  const inAhCurrency = (o: OrderDto, valuePkr: number | null | undefined, empty = "—") => {
    const rate = o.accountHolderCurrency ? o.exchangeRates?.[o.accountHolderCurrency] : undefined;
    if (valuePkr == null || !rate) return pkr(valuePkr, empty);
    return ownMoney(round2(valuePkr / rate), o.accountHolderCurrency, empty);
  };
  // eBay proceeds were entered in the Account Holder's currency, so show them exactly as entered.
  const ahPayout = (o: OrderDto) =>
    o.accountHolderCurrency && o.ebayNetProceedsOriginal != null
      ? ownMoney(o.ebayNetProceedsOriginal, o.accountHolderCurrency)
      : pkr(o.ebayNetProceeds);
  /**
   * The Account Holder's breakdown, in their currency (the AH rate locked on the order; PKR on orders from before
   * currencies): payout − buying price (product sell price × qty; a dropship line's client buying price) − 3PL charge − shipping label = profit, the same
   * profit as FinanceService and their invoice. Payout / 3PL charge / shipping were entered in their currency, so those
   * are shown as entered; buying price is converted. Their share = profit × their share % snapshot.
   */
  const ahFigures = (o: OrderDto) => {
    const rate = o.accountHolderCurrency ? o.exchangeRates?.[o.accountHolderCurrency] : undefined;
    const own = !!rate && o.ebayNetProceedsOriginal != null;
    const fromPkr = (v: number) => (own ? round2(v / rate!) : v);
    // STOCK: product sell price × qty (converted); DROPSHIP: the line's client buying price, entered in their currency.
    const buying = round2(
      o.items.reduce(
        (sum, i) =>
          sum +
          (own && i.clientTotalOriginal != null
            ? i.clientTotalOriginal
            : fromPkr(i.clientTotalSnapshot ?? (i.sellPriceSnapshot ?? 0) * i.quantity)),
        0,
      ),
    );
    const payout = own ? o.ebayNetProceedsOriginal! : o.ebayNetProceeds;
    const threePl = own ? (o.threePlPriceChargedOriginal ?? 0) : (o.threePlPriceChargedSnapshot ?? 0);
    const shipping = own ? (o.shippingCostOriginal ?? 0) : o.shippingCost;
    const profit = round2(payout - buying - threePl - shipping);
    const share = round2(profit * (o.accountHolderSharePercentSnapshot / 100));
    const fmt = (v: number) => (own ? ownMoney(v, o.accountHolderCurrency) : pkr(v));
    return { payout, buying, threePl, shipping, profit, share, fmt };
  };
  const ahColumn = (title: string, render: (f: ReturnType<typeof ahFigures>, o: OrderDto) => React.ReactNode) => ({
    title,
    key: `ah-${title}`,
    align: "right" as const,
    render: (_: unknown, o: OrderDto) => <span className="whitespace-nowrap">{render(ahFigures(o), o)}</span>,
  });
  const signed = (f: ReturnType<typeof ahFigures>, v: number) => (
    <span className={v < 0 ? "text-red-600" : "text-emerald-600"}>{f.fmt(v)}</span>
  );

  // Stock: buy price × qty; dropship: each line's buy total. Null while a dropship line still awaits its price.
  const itemBuyTotal = (i: OrderDto["items"][number]) =>
    i.buyTotalSnapshot ?? (i.buyPriceSnapshot == null ? null : i.buyPriceSnapshot * i.quantity);
  const buyTotal = (o: OrderDto) =>
    o.items.some((i) => itemBuyTotal(i) == null) ? null : o.items.reduce((sum, i) => sum + itemBuyTotal(i)!, 0);

  /**
   * A Stock Owner's figures for one item, in their own currency as entered (PKR on orders from before currencies).
   * Sell = the buy price the company pays them; share = sell minus the company's PROFIT_SHARE cut, i.e. cost + their
   * part of the profit — the same split as FinanceService.itemShareCut and their invoice.
   */
  const stockOwnerFigures = (i: OrderDto["items"][number]) => {
    const own = i.currency != null;
    const cost = ((own ? i.stockOwnerCostOriginal : i.stockOwnerCostSnapshot) ?? 0) * i.quantity;
    const sell = ((own ? i.buyPriceOriginal : i.buyPriceSnapshot) ?? 0) * i.quantity;
    const profit = sell - cost;
    const cut = i.stockOwnerPayoutModeSnapshot === "PROFIT_SHARE" ? ((i.stockOwnerSharePercentSnapshot ?? 0) / 100) * profit : 0;
    return { cost: round2(cost), sell: round2(sell), profit: round2(profit), share: round2(sell - cut) };
  };

  // Top-aligned so per-line amounts stay level with the product rows even when a total line is added below.
  const topAligned = () => ({ style: { verticalAlign: "top" as const } });

  // One amount per product line, lined up with the Products column (52px thumbnails), plus a total for 2+ lines.
  const stockOwnerColumn = (title: string, key: "cost" | "sell" | "profit" | "share") => ({
    title,
    key: `so-${key}`,
    align: "right" as const,
    onCell: topAligned,
    render: (_: unknown, order: OrderDto) => {
      const lines = order.items.map((i) => ({ id: i.id, currency: i.currency, value: stockOwnerFigures(i)[key] }));
      // Items on one order share the Stock Owner's currency snapshot.
      const currency = order.items[0]?.currency ?? null;
      return (
        <div className={`flex flex-col gap-2 whitespace-nowrap ${key === "profit" ? "text-emerald-600" : ""}`}>
          {lines.map((l) => (
            <div key={l.id} className="flex h-[52px] items-center justify-end">
              {ownMoney(l.value, l.currency)}
            </div>
          ))}
          {lines.length > 1 && (
            <div className="border-t border-slate-200 pt-1 font-semibold">
              {ownMoney(round2(lines.reduce((sum, l) => sum + l.value, 0)), currency)}
            </div>
          )}
        </div>
      );
    },
  });

  const isDropshipThreePl = threePlBulk && myThreePlType === ProductFulfillmentType.DROPSHIP;

  const columns: TableColumnsType<OrderDto> = [
    ...(isDropshipThreePl
      ? [
          {
            key: "actions",
            width: 48,
            render: (_: unknown, order: OrderDto) => (
              <EditAction
                onClick={() => setThreePlEditing(order)}
                disabled={order.status !== "PROCESSING" && order.status !== "SHIPPED"}
                disabledReason="Only PROCESSING or SHIPPED orders can be edited"
              />
            ),
          },
        ]
      : []),
    ...(canBulkEdit
      ? [
          {
            key: "actions",
            width: 48,
            render: (_: unknown, order: OrderDto) => (
              <EditAction
                onClick={() => router.push(`/orders/${order.id}/edit`)}
                disabled={isInvoiced(order)}
                disabledReason="On an invoice — delete the invoice to edit this order"
              />
            ),
          },
        ]
      : []),
    ...(bulkMode
      ? [
          {
            title: "Status",
            key: "status",
            render: (_: unknown, order: OrderDto) => (
              <Space size="small">
                {statusTag(order.status)}
                {isThreePl && order.stale && (
                  <Tooltip title={`In this status for ${order.daysInStatus} days`}>
                    <Tag color="red">⚠ {order.daysInStatus}d</Tag>
                  </Tooltip>
                )}
              </Space>
            ),
          },
        ]
      : []),
    {
      title: "Products",
      key: "products",
      onCell: isStockOwnerView ? topAligned : undefined,
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
    ...(isManager
      ? [{ title: "Account Holder", key: "accountHolder", render: (_: unknown, o: OrderDto) => userLabel(userById.get(o.accountHolderId)) }]
      : []),
    { title: "Date", dataIndex: "orderDate", render: (v: string) => formatDate(v), sorter: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    {
      title: "Order #",
      key: "ebayOrderRef",
      // Comments are notes for the 3PL; the API only sends them to managers and 3PLs.
      render: (_: unknown, o: OrderDto) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {o.ebayOrderRef}
          {o.comments && (
            // Hover: the first two lines; click: the whole comment in a popup.
            <Tooltip title={<span className="line-clamp-2 whitespace-pre-wrap">{o.comments}</span>}>
              <Button
                type="text"
                size="small"
                danger
                icon={<InfoCircleOutlined />}
                aria-label="Show order comments"
                onClick={() => setCommentOrder(o)}
              />
            </Tooltip>
          )}
        </span>
      ),
    },
    { title: "Tracking #", dataIndex: "trackingNumber", render: (v) => v ?? "—" },
    { title: "Qty", key: "qty", render: (_, o) => o.items.reduce((sum, i) => sum + i.quantity, 0) },
    ...(isStockOwnerView
      ? [
          stockOwnerColumn("Cost", "cost"),
          stockOwnerColumn("Sell price", "sell"),
          stockOwnerColumn("Profit", "profit"),
          stockOwnerColumn("Your share", "share"),
        ]
      : []),
    ...(isAccountHolderView
      ? [
          ahColumn("Payout", (f) => f.fmt(f.payout)),
          ahColumn("Buying price", (f) => f.fmt(f.buying)),
          ahColumn("3PL charge", (f) => f.fmt(f.threePl)),
          // No shipping cost = the label was bought on eBay and is already out of the payout.
          ahColumn("Shipping", (f) => (f.shipping ? f.fmt(f.shipping) : "—")),
          ahColumn("Profit", (f) => signed(f, f.profit)),
          ahColumn("Your share", (f, o) => (
            <>
              {signed(f, f.share)} <span className="text-xs text-slate-400">({o.accountHolderSharePercentSnapshot}%)</span>
            </>
          )),
        ]
      : []),
    ...(!isThreePl && !isStockOwnerView && !isAccountHolderView ? [{ title: "Payout", key: "payout", render: (_: unknown, o: OrderDto) => ahPayout(o) }] : []),
    ...(isManager
      ? [
          { title: "Buy Price", key: "buyPrice", render: (_: unknown, o: OrderDto) => inAhCurrency(o, buyTotal(o), "Pending") },
          { title: "3PL Fee", key: "threePlFee", render: (_: unknown, o: OrderDto) => inAhCurrency(o, o.threePlPayoutSnapshot) },
          { title: "Profit", key: "profit", render: (_: unknown, o: OrderDto) => inAhCurrency(o, o.companyProfit) },
          { title: "Invoiced", key: "invoiced", render: (_: unknown, o: OrderDto) => <InvoiceStatusTags order={o} /> },
        ]
      : []),
    ...(isThreePl && myThreePlType === ProductFulfillmentType.DROPSHIP
      ? [
          {
            title: "Buy Price",
            key: "buyPrice",
            render: (_: unknown, order: OrderDto) => {
              const product = productById.get(order.items[0]?.productId ?? "");
              if (product?.fulfillmentType !== "DROPSHIP") return "—";
              // One saved price per product line (all units), in the 3PL's own currency as entered (PKR on orders
              // from before currencies). Edited in the Edit popup.
              return (
                <div className="flex min-w-40 flex-col gap-1">
                  {order.items.map((item) => (
                    <div key={item.id}>
                      {order.items.length > 1 && (
                        <div className="truncate text-xs text-slate-500">
                          {productById.get(item.productId)?.title ?? "Product"} ×{item.quantity}
                        </div>
                      )}
                      {item.currency && item.buyTotalOriginal != null
                        ? ownMoney(item.buyTotalOriginal, item.currency)
                        : item.buyTotalSnapshot != null
                          ? pkr(item.buyTotalSnapshot)
                          : <span className="text-slate-400">Pending</span>}
                    </div>
                  ))}
                </div>
              );
            },
          },
        ]
      : []),
    // Account Holders and Stock Owners can't change status (the API refuses), so they get a read-only tag; Staff without
    // canManageOrders keep the inline dropdown.
    ...(bulkMode
      ? []
      : [
          {
            title: "Status",
            key: "status",
            render: (_: unknown, order: OrderDto) =>
              isAccountHolderView || isStockOwnerView ? (
                statusTag(order.status)
              ) : (
                <Select
                  size="small"
                  value={order.status}
                  onChange={(v) => handleStatusChange(order, v)}
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                  className="w-32"
                />
              ),
          },
        ]),
    ...(isThreePl
      ? [
          {
            title: "Label",
            key: "label",
            render: (_: unknown, order: OrderDto) =>
              order.status === "PROCESSING" && order.shippingLabelUrl ? (
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  onClick={() => handlePrintLabel(order.shippingLabelUrl as string)}
                  title="Print shipping label"
                >
                  Print
                </Button>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    ...(isManager && !canBulkEdit
      ? [
          {
            key: "actions",
            render: (_: unknown, order: OrderDto) => (
              <EditAction
                onClick={() => router.push(`/orders/${order.id}/edit`)}
                disabled={isInvoiced(order)}
                disabledReason="On an invoice — delete the invoice to edit this order"
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Orders</h1>
          {canCreate && (
            <Button type="primary" onClick={() => router.push("/orders/new")}>
              New order
            </Button>
          )}
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <Card size="small" className="mt-4">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label>
              Order ID
              <Input
                allowClear
                placeholder="eBay order number"
                value={orderRefInput}
                onChange={(e) => setOrderRefInput(e.target.value)}
                className="mt-1 flex w-56"
              />
            </label>
            {isManager && (
              <>
                <label>
                  Account Holder
                  <Select
                    showSearch={searchable}
                    allowClear
                    disabled={searchingRef}
                    placeholder="All"
                    value={filter.accountHolderId || undefined}
                    onChange={(v) => setFilter((f) => ({ ...f, accountHolderId: v ?? "" }))}
                    options={userNameOptions(accountHolders)}
                    className="mt-1 flex w-56"
                  />
                </label>
                <label>
                  3PL
                  <Select
                    showSearch={searchable}
                    allowClear
                    disabled={searchingRef}
                    placeholder="All"
                    value={filter.threePlId || undefined}
                    onChange={(v) => setFilter((f) => ({ ...f, threePlId: v ?? "" }))}
                    options={userNameOptions(threePls)}
                    className="mt-1 flex w-56"
                  />
                </label>
              </>
            )}
            <label>
              Status
              <Select
                allowClear
                disabled={searchingRef}
                placeholder="All"
                value={filter.status || undefined}
                onChange={(v) => setFilter((f) => ({ ...f, status: v ?? "" }))}
                options={[
                  ...STATUSES.map((s) => ({ value: s, label: s })),
                  ...(threePlBulk ? [{ value: NO_TRACKING, label: "No tracking #" }] : []),
                ]}
                className="mt-1 flex w-36"
              />
            </label>
            <label>
              Start date
              <DateField disabled={searchingRef} value={filter.startDate} onChange={(v) => setFilter((f) => ({ ...f, startDate: v }))} className="mt-1 flex" />
            </label>
            <label>
              End date
              <DateField disabled={searchingRef} value={filter.endDate} onChange={(v) => setFilter((f) => ({ ...f, endDate: v }))} className="mt-1 flex" />
            </label>
          </div>
        </Card>

        {bulkMode && (
          <div className="mt-4">
            <StatusCounts
              totalLabel="Total orders"
              total={orders.length}
              statuses={countStatuses}
              counts={Object.fromEntries(statusCounts)}
              active={searchingRef ? null : filter.status || null}
              onSelect={(st) => setFilter((f) => ({ ...f, status: st ?? "" }))}
              labels={{ [NO_TRACKING]: "No tracking #" }}
              colors={{ [NO_TRACKING]: "#ea580c" }}
            />
          </div>
        )}

        <Table<OrderDto>
          className={bulkMode && selectedIds.length > 0 ? "mt-6 mb-24" : "mt-6"}
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visibleOrders}
          rowClassName={(o) => (o.comments ? "order-row-comment" : "")}
          rowSelection={
            bulkMode
              ? {
                  selectedRowKeys: selectedIds,
                  onChange: setSelectedIds,
                  selections: [Table.SELECTION_ALL, Table.SELECTION_NONE],
                  fixed: true,
                  getCheckboxProps: (o: OrderDto) => ({ disabled: threePlBulk && o.status !== "PROCESSING" }),
                  renderCell: (_checked, o, _index, node) =>
                    threePlBulk && o.status !== "PROCESSING" ? (
                      <Tooltip title="Only PROCESSING orders can be marked as shipped">{node}</Tooltip>
                    ) : (
                      node
                    ),
                }
              : undefined
          }
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: searchingRef ? `No order found for "${filter.orderRef}".` : "No orders match these filters." }}
        />

        {bulkMode && (
          <div className={`bulk-bar ${selectedIds.length > 0 ? "bulk-bar-open" : ""}`} aria-hidden={selectedIds.length === 0}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">
                {selectedIds.length} order{selectedIds.length === 1 ? "" : "s"} selected
              </span>
              <Button type="link" size="small" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Change status to</span>
              <Select
                placeholder="Select status"
                value={bulkStatus}
                onChange={setBulkStatus}
                options={bulkStatuses.map((s) => ({ value: s, label: s }))}
                className="w-40"
              />
              <Button
                type="primary"
                disabled={!bulkStatus}
                onClick={() => {
                  setRefundChoice(FULL_REFUND);
                  setConfirmOpen(true);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        <Modal
          open={!!commentOrder}
          title={`Comments · Order ${commentOrder?.ebayOrderRef ?? ""}`}
          onCancel={() => setCommentOrder(null)}
          footer={<Button onClick={() => setCommentOrder(null)}>Close</Button>}
        >
          <p className="whitespace-pre-wrap break-words">{commentOrder?.comments}</p>
        </Modal>

        <Modal
          open={!!refundOrder}
          title="Refund order"
          onCancel={() => !refundSaving && setRefundOrder(null)}
          maskClosable={!refundSaving}
          okText="Mark as refunded"
          okButtonProps={{ loading: refundSaving, disabled: !refundOrder || refundAmountFor(refundOrder, refundChoice) === null }}
          onOk={handleRefundSave}
        >
          {refundOrder && <RefundChoice order={refundOrder} value={refundChoice} onChange={setRefundChoice} />}
        </Modal>

        <ThreePlOrderModal
          order={threePlEditing}
          productById={productById}
          currency={myCurrency}
          statusTag={statusTag}
          onClose={() => setThreePlEditing(null)}
          onSaved={() => {
            setThreePlEditing(null);
            refresh();
          }}
        />

        <Modal
          open={confirmOpen}
          title="Confirm status change"
          width={560}
          onCancel={() => !bulkSaving && setConfirmOpen(false)}
          maskClosable={!bulkSaving}
          footer={[
            <Button key="cancel" onClick={() => setConfirmOpen(false)} disabled={bulkSaving}>
              Cancel
            </Button>,
            <Button key="verify" type="primary" loading={bulkSaving} disabled={bulkRefundAmount === null} onClick={handleBulkSave}>
              Verify &amp; update
            </Button>,
          ]}
        >
          <Alert
            type="warning"
            showIcon
            title="This action can't be undone"
            description={`Please check each order below carefully and verify the change before continuing. ${
              selectedOrders.filter((o) => o.status !== bulkStatus).length
            } of ${selectedOrders.length} selected orders will be updated.`}
            className="mb-4"
          />
          {singleRefund && (
            <div className="mb-4">
              <RefundChoice order={selectedOrders[0]} value={refundChoice} onChange={setRefundChoice} />
            </div>
          )}
          {bulkStatus === "REFUNDED" && selectedOrders.length > 1 && (
            <Alert
              type="info"
              showIcon
              className="mb-4"
              title="Each order is refunded in full (its whole eBay payout). For a partial refund, select one order at a time."
            />
          )}
          <Table<OrderDto>
            rowKey="id"
            size="small"
            dataSource={selectedOrders}
            pagination={false}
            scroll={{ y: 320 }}
            columns={[
              { title: "Order #", dataIndex: "ebayOrderRef" },
              { title: "Current status", key: "current", render: (_, o) => statusTag(o.status) },
              {
                title: "New status",
                key: "next",
                render: (_, o) =>
                  !bulkStatus || o.status === bulkStatus ? (
                    <span className="text-xs text-slate-400">No change</span>
                  ) : (
                    statusTag(bulkStatus)
                  ),
              },
            ]}
          />
        </Modal>
      </main>
    </>
  );
}
