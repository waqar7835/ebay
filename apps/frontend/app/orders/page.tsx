"use client";

import {
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZES,
  ProductFulfillmentType,
  Role,
  type Currency,
  type OrderDto,
  type OrderStatus,
  type ProductDto,
} from "@ebay-order-management/shared";
import { EditOutlined, InfoCircleOutlined, PrinterOutlined, SendOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Table,
  Tabs,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";
import { useEffect, useRef, useState, type Key } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import InvoiceStatusTags, { isInvoiced } from "@/components/InvoiceStatusTags";
import { EditAction } from "@/components/RowActions";
import { money as ownMoney, pkr } from "@/lib/currency";
import ProductThumb from "@/components/ProductThumb";
import ThreePlOrderModal from "@/components/ThreePlOrderModal";
import OrderPriceModal from "@/components/OrderPriceModal";
import RefundChoice, { FULL_REFUND, refundAmountFor, restockFor, type RefundChoiceValue } from "@/components/RefundChoice";
import StatusCounts, { STATUS_COLORS } from "@/components/StatusCounts";
import DateField from "@/components/DateField";
import {
  bulkUpdateOrderStatus,
  computeCurrentCycle,
  getMyCompany,
  getMyProfile,
  getStoredUser,
  getToken,
  listOrdersPage,
  listProducts,
  listUsers,
  mediaUrl,
  updateOrderStatus,
  updateThreePlOrder,
} from "@/lib/api";
import { searchable, userLabel, userNameOptions } from "@/lib/selectOptions";
import { formatDate } from "@/lib/date";
import { productLabel, variationName } from "@/lib/productLabel";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

// Pseudo-status for the 3PL "No tracking #" card: shipped or delivered but no tracking number entered yet (counted by
// the API in statusCounts).
const NO_TRACKING = "NO_TRACKING";

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
  // Server-side paging: one page of orders, the total matching the filters, and per-status counts over every filter
  // except status.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);
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
  // A DROPSHIP 3PL edits its PROCESSING orders (buy prices, supplier URL) in a popup.
  const [threePlEditing, setThreePlEditing] = useState<OrderDto | null>(null);
  // Order whose full comment is open in a popup.
  const [commentOrder, setCommentOrder] = useState<OrderDto | null>(null);
  // A 3PL enters dropship buy prices in their own currency; a STOCK 3PL has no buy prices at all.
  const [myCurrency, setMyCurrency] = useState<Currency | null>(null);
  const [myThreePlType, setMyThreePlType] = useState<ProductFulfillmentType | null>(null);
  // 3PL list (decided 2026-10-08): a STOCK 3PL switches between its Processing and Shipped orders (adding tracking
  // numbers on the Shipped tab); a DROPSHIP 3PL only ever lists its Processing orders.
  const [threePlTab, setThreePlTab] = useState<"PROCESSING" | "SHIPPED">("PROCESSING");
  // STOCK 3PL: order whose tracking number is being added/edited.
  const [trackingOrder, setTrackingOrder] = useState<OrderDto | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [trackingSaving, setTrackingSaving] = useState(false);

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
  // A 3PL gets the same, limited to what it may do anyway: mark its own PROCESSING orders SHIPPED (a single "Mark as
  // shipped" button instead of a status picker).
  const threePlBulk = isThreePl && !canBulkEdit;
  const bulkMode = canBulkEdit || threePlBulk;
  const bulkStatuses = threePlBulk ? ["SHIPPED" as OrderStatus] : STATUSES;
  const defaultBulkStatus = threePlBulk ? ("SHIPPED" as OrderStatus) : undefined;

  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  // Double-clicking a price cell opens that order's prices in a popup (Admin / Staff who manage orders).
  const [priceOrder, setPriceOrder] = useState<OrderDto | null>(null);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | undefined>(defaultBulkStatus);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  // REFUNDED asks full or partial: in the bulk confirm popup when one order is selected, or in its own popup when a
  // Staff member picks it from the inline status dropdown.
  const [refundChoice, setRefundChoice] = useState<RefundChoiceValue>(FULL_REFUND);
  const [refundOrder, setRefundOrder] = useState<OrderDto | null>(null);
  const [refundSaving, setRefundSaving] = useState(false);

  /** Loads the current page; responses to older requests (filters changed meanwhile) are dropped. */
  function refresh() {
    const seq = ++requestSeq.current;
    setLoading(true);
    listOrdersPage(
      {
        // With an order number the API ignores every other filter and finds the order in any status or date.
        orderRef: filter.orderRef.trim() || undefined,
        accountHolderId: filter.accountHolderId || undefined,
        threePlId: filter.threePlId || undefined,
        // A 3PL lists one status at a time (its tab); the status counts above the table come back for every status.
        status: (threePlBulk ? threePlListStatus : filter.status || undefined) as OrderStatus | undefined,
        startDate: filter.startDate || undefined,
        endDate: filter.endDate || undefined,
      },
      page,
      pageSize,
    )
      .then((res) => {
        if (seq !== requestSeq.current) return;
        // Orders moved out of the filter (e.g. a status change) can empty the last page: step back to the new last one.
        if (res.data.length === 0 && page > 1 && res.total > 0) {
          setPage(Math.ceil(res.total / pageSize));
          return;
        }
        setOrders(res.data);
        setTotal(res.total);
        setServerCounts(res.statusCounts);
      })
      .catch((err) => seq === requestSeq.current && setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => seq === requestSeq.current && setLoading(false));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers as never).catch(() => undefined);
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

  const isDropshipThreePl = threePlBulk && myThreePlType === ProductFulfillmentType.DROPSHIP;
  const isStockThreePl = threePlBulk && myThreePlType === ProductFulfillmentType.STOCK;
  const threePlListStatus = isStockThreePl ? threePlTab : "PROCESSING";

  // Changing a filter (or the 3PL tab) goes back to the first page; changing page or page size keeps the filters.
  const filterKey = [
    filter.accountHolderId,
    filter.threePlId,
    filter.status,
    filter.startDate,
    filter.endDate,
    filter.orderRef,
    threePlListStatus,
  ].join("|");
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    setSelectedIds([]);
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    if (filterInit) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, pageSize, filterInit]);

  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.orderRef === orderRefInput.trim() ? f : { ...f, orderRef: orderRefInput.trim() })), 400);
    return () => clearTimeout(t);
  }, [orderRefInput]);

  // An order number search overrides the other filters (they're shown disabled and not applied).
  const searchingRef = !!filter.orderRef;

  const productById = new Map(products.map((p) => [p.id, p]));
  const productName = (id: string) => {
    const p = productById.get(id);
    return p ? productLabel(p) : "Product";
  };
  const userById = new Map(users.map((u) => [u.id, u]));
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  // 3PLs: display-only count cards over all their orders; "No tracking #" only for a STOCK 3PL (dropship 3PLs don't
  // enter tracking numbers).
  const countStatuses: string[] = threePlBulk
    ? ["PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED", ...(isStockThreePl ? [NO_TRACKING] : [])]
    : STATUSES;
  // The API filters by status (a 3PL's tab included), except on an order number search, which finds the order in any
  // status — a 3PL still only sees it on the tab of its own status.
  const visibleOrders = threePlBulk && searchingRef ? orders.filter((o) => o.status === threePlListStatus) : orders;
  const statusCounts = new Map<string, number>(STATUSES.map((s) => [s, serverCounts[s] ?? 0]));
  if (isStockThreePl) statusCounts.set(NO_TRACKING, serverCounts[NO_TRACKING] ?? 0);
  const countsTotal = STATUSES.reduce((sum, s) => sum + (statusCounts.get(s) ?? 0), 0);
  // A dropship order can't ship until the 3PL has entered every line's buy price.
  const missingBuyPrice = (o: OrderDto) => isDropshipThreePl && o.items.some((i) => i.buyTotalSnapshot == null);
  const canMarkShipped = (o: OrderDto) => o.status === "PROCESSING" && !missingBuyPrice(o);
  const threePlSelectable = threePlBulk && threePlListStatus === "PROCESSING";

  function openMarkShipped(order: OrderDto) {
    setSelectedIds([order.id]);
    setBulkStatus("SHIPPED" as OrderStatus);
    setConfirmOpen(true);
  }

  async function handleTrackingSave() {
    if (!trackingOrder) return;
    setTrackingSaving(true);
    try {
      await updateThreePlOrder(trackingOrder.id, { trackingNumber: trackingInput.trim() });
      setTrackingOrder(null);
      refresh();
    } catch (err) {
      setTrackingOrder(null);
      setError(err instanceof Error ? err.message : "Failed to save the tracking number");
    } finally {
      setTrackingSaving(false);
    }
  }
  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id));
  // Refunds are one order at a time (each has its own full/partial, amount and restock choice), so REFUNDED is only
  // offered with a single, not yet refunded order selected.
  const canRefundSelection = selectedOrders.length === 1 && selectedOrders[0].status !== "REFUNDED";
  const singleRefund = bulkStatus === "REFUNDED" && canRefundSelection;
  // Ticking a second order after picking REFUNDED drops the choice rather than leaving a Save that can't work.
  useEffect(() => {
    if (bulkStatus === "REFUNDED" && !canRefundSelection) setBulkStatus(defaultBulkStatus);
  }, [bulkStatus, canRefundSelection, defaultBulkStatus]);
  const bulkRefundAmount = singleRefund ? refundAmountFor(selectedOrders[0], refundChoice) : undefined;

  async function handleBulkSave() {
    if (!bulkStatus || bulkRefundAmount === null || (bulkStatus === "REFUNDED" && !singleRefund)) return;
    setBulkSaving(true);
    try {
      if (singleRefund) {
        const order = selectedOrders[0];
        await updateOrderStatus(order.id, bulkStatus, bulkRefundAmount, restockFor(order, refundChoice));
      } else {
        await bulkUpdateOrderStatus(selectedOrders.map((o) => o.id), bulkStatus);
      }
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
      await updateOrderStatus(refundOrder.id, "REFUNDED" as OrderStatus, amount, restockFor(refundOrder, refundChoice));
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

  /** Price cells: double-click opens the order's prices popup (Admin / Staff who manage orders). */
  const priceCell = (o: OrderDto) =>
    canBulkEdit
      ? { onDoubleClick: () => setPriceOrder(o), title: "Double-click to edit prices", className: "cursor-pointer select-none" }
      : {};

  const columns: TableColumnsType<OrderDto> = [
    ...(isDropshipThreePl
      ? [
          {
            key: "actions",
            width: 48,
            render: (_: unknown, order: OrderDto) => (
              <EditAction
                onClick={() => setThreePlEditing(order)}
                disabled={order.status !== "PROCESSING"}
                disabledReason="Only PROCESSING orders can be edited"
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
    // 3PLs only list one status at a time (their Processing / Shipped orders), so they get no Status column.
    ...(canBulkEdit ? [{ title: "Status", key: "status", render: (_: unknown, order: OrderDto) => statusTag(order.status) }] : []),
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
                    {[product?.sku ?? "—", variationName(product), `×${item.quantity}`].filter(Boolean).join(" · ")}
                  </div>
                  {isStockThreePl && product && (
                    <div className={`text-xs ${product.stockQuantity <= 0 ? "text-red-600" : product.stockQuantity <= 5 ? "text-orange-500" : "text-slate-500"}`}>
                      {product.stockQuantity} left in stock
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ),
    },
    ...(isThreePl
      ? []
      : [
          {
            title: "Source",
            key: "source",
            render: (_: unknown, o: OrderDto) => {
              const product = productById.get(o.items[0]?.productId ?? "");
              return product ? (SOURCE_LABEL[product.fulfillmentType] ?? product.fulfillmentType) : "—";
            },
          },
        ]),
    ...(isManager
      ? [{ title: "Account Holder", key: "accountHolder", render: (_: unknown, o: OrderDto) => userLabel(userById.get(o.accountHolderId)) }]
      : []),
    { title: "Date", dataIndex: "orderDate", render: (v: string) => formatDate(v) },
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
    // Dropship 3PLs don't handle tracking numbers; a STOCK 3PL adds/edits them on its Shipped tab.
    ...(isDropshipThreePl || (isStockThreePl && threePlTab === "PROCESSING")
      ? []
      : [
          {
            title: "Tracking #",
            key: "trackingNumber",
            render: (_: unknown, o: OrderDto) =>
              isStockThreePl ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {o.trackingNumber ?? <span className="text-orange-500">Not added</span>}
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label="Edit tracking number"
                    onClick={() => {
                      setTrackingInput(o.trackingNumber ?? "");
                      setTrackingOrder(o);
                    }}
                  />
                </span>
              ) : (
                (o.trackingNumber ?? "—")
              ),
          },
        ]),
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
    ...(!isThreePl && !isStockOwnerView && !isAccountHolderView
      ? [{ title: "Payout", key: "payout", render: (_: unknown, o: OrderDto) => ahPayout(o), onCell: priceCell }]
      : []),
    ...(isManager
      ? [
          {
            title: "Buy Price",
            key: "buyPrice",
            render: (_: unknown, o: OrderDto) => inAhCurrency(o, buyTotal(o), "Pending"),
            onCell: priceCell,
          },
          {
            title: "3PL Fee",
            key: "threePlFee",
            // Dropship orders have no 3PL fee: the 3PL's payout there is the buy price, already in Buy Price.
            render: (_: unknown, o: OrderDto) =>
              productById.get(o.items[0]?.productId ?? "")?.fulfillmentType === ProductFulfillmentType.DROPSHIP
                ? "—"
                : inAhCurrency(o, o.threePlPayoutSnapshot),
            onCell: priceCell,
          },
          { title: "Profit", key: "profit", render: (_: unknown, o: OrderDto) => inAhCurrency(o, o.companyProfit), onCell: priceCell },
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
                          {productName(item.productId)} ×{item.quantity}
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
    ...(isThreePl && !isDropshipThreePl && threePlListStatus === "PROCESSING"
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
    ...(threePlSelectable
      ? [
          {
            key: "ship",
            render: (_: unknown, order: OrderDto) => (
              <Tooltip title={missingBuyPrice(order) ? "Enter the buy price of every product first (Edit)" : undefined}>
                <Button size="small" icon={<SendOutlined />} disabled={!canMarkShipped(order)} onClick={() => openMarkShipped(order)}>
                  Mark as shipped
                </Button>
              </Tooltip>
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
            {!threePlBulk && (
              <label>
                Status
                <Select
                  allowClear
                  disabled={searchingRef}
                  placeholder="All"
                  value={filter.status || undefined}
                  onChange={(v) => setFilter((f) => ({ ...f, status: v ?? "" }))}
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                  className="mt-1 flex w-36"
                />
              </label>
            )}
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
              total={countsTotal}
              statuses={countStatuses}
              counts={Object.fromEntries(statusCounts)}
              active={threePlBulk || searchingRef ? null : filter.status || null}
              onSelect={threePlBulk ? undefined : (st) => setFilter((f) => ({ ...f, status: st ?? "" }))}
              labels={{ [NO_TRACKING]: "No tracking #" }}
              colors={{ [NO_TRACKING]: "#ea580c" }}
            />
          </div>
        )}

        {isStockThreePl && (
          <Tabs
            className="mt-4"
            activeKey={threePlTab}
            onChange={(key) => {
              setThreePlTab(key as "PROCESSING" | "SHIPPED");
              setSelectedIds([]);
            }}
            items={[
              { key: "PROCESSING", label: `Processing (${statusCounts.get("PROCESSING") ?? 0})` },
              { key: "SHIPPED", label: `Shipped (${statusCounts.get("SHIPPED") ?? 0})` },
            ]}
          />
        )}

        <Table<OrderDto>
          className={`${isStockThreePl ? "mt-2" : "mt-6"} ${bulkMode && selectedIds.length > 0 ? "mb-24" : ""}`}
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visibleOrders}
          rowClassName={(o) => (o.comments ? "order-row-comment" : "")}
          rowSelection={
            canBulkEdit || threePlSelectable
              ? {
                  selectedRowKeys: selectedIds,
                  onChange: setSelectedIds,
                  selections: [Table.SELECTION_ALL, Table.SELECTION_NONE],
                  fixed: true,
                  getCheckboxProps: (o: OrderDto) => ({ disabled: threePlBulk && !canMarkShipped(o) }),
                  renderCell: (_checked, o, _index, node) =>
                    threePlBulk && missingBuyPrice(o) ? (
                      <Tooltip title="Enter the buy price of every product first (Edit)">{node}</Tooltip>
                    ) : (
                      node
                    ),
                }
              : undefined
          }
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total: threePlBulk && searchingRef ? visibleOrders.length : total,
            showSizeChanger: true,
            pageSizeOptions: LIST_PAGE_SIZES.map(String),
            showTotal: (n, [from, to]) => `${from}–${to} of ${n} orders`,
            onChange: (p, size) => {
              setPage(size !== pageSize ? 1 : p);
              setPageSize(size);
            },
          }}
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
            {threePlBulk ? (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => {
                  setBulkStatus("SHIPPED" as OrderStatus);
                  setConfirmOpen(true);
                }}
              >
                Mark as shipped
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">Change status to</span>
                <Select
                  placeholder="Select status"
                  value={bulkStatus}
                  onChange={setBulkStatus}
                  options={bulkStatuses.map((s) =>
                    s === "REFUNDED" && !canRefundSelection
                      ? {
                          value: s,
                          disabled: true,
                          label: (
                            <span>
                              {s} <span className="text-xs text-slate-400">· one order at a time</span>
                            </span>
                          ),
                        }
                      : { value: s, label: s },
                  )}
                  popupMatchSelectWidth={false}
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
            )}
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

        <Modal
          open={!!trackingOrder}
          title={`Tracking number · Order ${trackingOrder?.ebayOrderRef ?? ""}`}
          okText="Save"
          onOk={handleTrackingSave}
          confirmLoading={trackingSaving}
          onCancel={() => !trackingSaving && setTrackingOrder(null)}
          maskClosable={!trackingSaving}
        >
          <Input
            autoFocus
            allowClear
            placeholder="Tracking number"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
            onPressEnter={handleTrackingSave}
          />
        </Modal>

        <OrderPriceModal
          order={priceOrder}
          productById={productById}
          onClose={() => setPriceOrder(null)}
          // The saved order replaces its row right away; list-only fields (days in status…) are kept.
          onSaved={(updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)))}
        />

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
          title={threePlBulk ? "Mark as shipped" : "Confirm status change"}
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
