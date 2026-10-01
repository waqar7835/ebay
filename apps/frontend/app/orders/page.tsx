"use client";

import { Role, type Currency, type OrderDto, type OrderStatus, type ProductDto } from "@ebay-order-management/shared";
import { PrinterOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import InvoiceStatusTags, { isInvoiced } from "@/components/InvoiceStatusTags";
import { EditAction } from "@/components/RowActions";
import { currencySymbol, pkr } from "@/lib/currency";
import ProductThumb from "@/components/ProductThumb";
import DateField from "@/components/DateField";
import {
  computeCurrentCycle,
  getMyCompany,
  getMyProfile,
  getStoredUser,
  getToken,
  listOrders,
  listProducts,
  listUsers,
  mediaUrl,
  submitDropshipBuyPrice,
  updateOrderStatus,
} from "@/lib/api";
import { searchable, userLabel, userOptions } from "@/lib/selectOptions";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  roles: string[];
}

const STATUSES: OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as OrderStatus[];

const SOURCE_LABEL: Record<string, string> = {
  STOCK: "Stock",
  DROPSHIP: "AliExpress",
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ accountHolderId: string; threePlId: string; status: string; startDate: string; endDate: string }>({
    accountHolderId: "",
    threePlId: "",
    status: "",
    startDate: "",
    endDate: "",
  });
  const [filterInit, setFilterInit] = useState(false);
  const [buyPriceDrafts, setBuyPriceDrafts] = useState<Record<string, string>>({});
  const [buyPriceSaving, setBuyPriceSaving] = useState<string | null>(null);
  // A 3PL enters dropship buy prices in their own currency.
  const [myCurrency, setMyCurrency] = useState<Currency | null>(null);

  const currentUser = getStoredUser();
  const isThreePl = currentUser?.roles.includes(Role.THREE_PL) ?? false;
  const isManager =
    currentUser?.roles.includes(Role.ADMIN) ||
    currentUser?.roles.includes(Role.STAFF) ||
    currentUser?.roles.includes(Role.SUPER_ADMIN) ||
    currentUser?.roles.includes(Role.PLATFORM_STAFF) ||
    !!currentUser?.staffPermissions?.canManageOrders;

  function refresh(f = filter) {
    listOrders({
      accountHolderId: f.accountHolderId || undefined,
      threePlId: f.threePlId || undefined,
      status: (f.status || undefined) as OrderStatus | undefined,
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
    if (isThreePl) getMyProfile().then((me) => setMyCurrency(me.currency)).catch(() => undefined);

    if (isManager) {
      getMyCompany()
        .then((company) => {
          const cycle = computeCurrentCycle(company.billingAnchorDay);
          setFilter({ accountHolderId: "", threePlId: "", status: "", startDate: cycle.start, endDate: cycle.end });
          setFilterInit(true);
        })
        .catch(() => setFilterInit(true));
    } else {
      setFilterInit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (filterInit) refresh(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.accountHolderId, filter.threePlId, filter.status, filter.startDate, filter.endDate]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const threePls = users.filter((u) => u.roles.includes("THREE_PL"));

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    await updateOrderStatus(orderId, status);
    refresh();
  }

  function handlePrintLabel(shippingLabelUrl: string) {
    const win = window.open(mediaUrl(shippingLabelUrl), "_blank");
    if (win) {
      setTimeout(() => win.print(), 500);
    }
  }

  async function handleSubmitBuyPrice(orderId: string) {
    const value = Number(buyPriceDrafts[orderId]);
    if (Number.isNaN(value)) return;
    setBuyPriceSaving(orderId);
    try {
      await submitDropshipBuyPrice(orderId, value);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save buy price");
    } finally {
      setBuyPriceSaving(null);
    }
  }

  // Order amounts are stored in PKR (converted from each user's currency when the order was saved).
  const money = pkr;
  // Buy price × qty across the order's items; null while a dropship item still awaits its buy price.
  const buyTotal = (o: OrderDto) =>
    o.items.some((i) => i.buyPriceSnapshot == null) ? null : o.items.reduce((sum, i) => sum + i.buyPriceSnapshot! * i.quantity, 0);

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
    ...(isManager
      ? [{ title: "Account Holder", key: "accountHolder", render: (_: unknown, o: OrderDto) => userLabel(userById.get(o.accountHolderId)) }]
      : []),
    { title: "Date", dataIndex: "orderDate", sorter: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    { title: "Order #", dataIndex: "ebayOrderRef" },
    { title: "Tracking #", dataIndex: "trackingNumber", render: (v) => v ?? "—" },
    { title: "Qty", key: "qty", render: (_, o) => o.items.reduce((sum, i) => sum + i.quantity, 0) },
    ...(!isThreePl ? [{ title: "Payout", key: "payout", render: (_: unknown, o: OrderDto) => money(o.ebayNetProceeds) }] : []),
    ...(isManager
      ? [
          { title: "Buy Price", key: "buyPrice", render: (_: unknown, o: OrderDto) => money(buyTotal(o), "Pending") },
          { title: "3PL Fee", key: "threePlFee", render: (_: unknown, o: OrderDto) => money(o.threePlPayoutSnapshot) },
          { title: "Profit", key: "profit", render: (_: unknown, o: OrderDto) => money(o.companyProfit) },
          { title: "Invoiced", key: "invoiced", render: (_: unknown, o: OrderDto) => <InvoiceStatusTags order={o} /> },
        ]
      : []),
    ...(isThreePl
      ? [
          {
            title: "Buy Price",
            key: "buyPrice",
            render: (_: unknown, order: OrderDto) => {
              // DROPSHIP orders always have exactly one item.
              const item = order.items[0];
              const product = productById.get(item?.productId ?? "");
              if (product?.fulfillmentType !== "DROPSHIP") return "—";
              if (item.buyPriceSnapshot != null) return money(item.buyPriceSnapshot);
              return (
                <Space.Compact size="small">
                  <InputNumber
                    value={buyPriceDrafts[order.id] ? Number(buyPriceDrafts[order.id]) : null}
                    onChange={(v) => setBuyPriceDrafts((d) => ({ ...d, [order.id]: v == null ? "" : String(v) }))}
                    placeholder="0.00"
                    prefix={myCurrency ? currencySymbol(myCurrency) : undefined}
                    min={0}
                    step={0.01}
                    className="w-28"
                  />
                  <Button onClick={() => handleSubmitBuyPrice(order.id)} loading={buyPriceSaving === order.id}>
                    Save
                  </Button>
                </Space.Compact>
              );
            },
          },
        ]
      : []),
    {
      title: "Status",
      key: "status",
      render: (_, order) => (
        <Space size="small">
          <Select
            size="small"
            value={order.status}
            onChange={(v) => handleStatusChange(order.id, v)}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            className="w-32"
          />
          {isThreePl && order.stale && (
            <Tooltip title={`In this status for ${order.daysInStatus} days`}>
              <Tag color="red">⚠ {order.daysInStatus}d</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
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
    ...(isManager
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
          <Button type="primary" onClick={() => router.push("/orders/new")}>
            New order
          </Button>
        </div>

        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <Card size="small" className="mt-4">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            {isManager && (
              <>
                <label>
                  Account Holder
                  <Select
                    showSearch={searchable}
                    allowClear
                    placeholder="All"
                    value={filter.accountHolderId || undefined}
                    onChange={(v) => setFilter((f) => ({ ...f, accountHolderId: v ?? "" }))}
                    options={userOptions(accountHolders)}
                    className="mt-1 flex w-56"
                  />
                </label>
                <label>
                  3PL
                  <Select
                    showSearch={searchable}
                    allowClear
                    placeholder="All"
                    value={filter.threePlId || undefined}
                    onChange={(v) => setFilter((f) => ({ ...f, threePlId: v ?? "" }))}
                    options={userOptions(threePls)}
                    className="mt-1 flex w-56"
                  />
                </label>
              </>
            )}
            <label>
              Status
              <Select
                allowClear
                placeholder="All"
                value={filter.status || undefined}
                onChange={(v) => setFilter((f) => ({ ...f, status: v ?? "" }))}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
                className="mt-1 flex w-36"
              />
            </label>
            <label>
              Start date
              <DateField value={filter.startDate} onChange={(v) => setFilter((f) => ({ ...f, startDate: v }))} className="mt-1 flex" />
            </label>
            <label>
              End date
              <DateField value={filter.endDate} onChange={(v) => setFilter((f) => ({ ...f, endDate: v }))} className="mt-1 flex" />
            </label>
          </div>
        </Card>

        <Table<OrderDto>
          className="mt-6"
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={orders}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: "No orders match these filters." }}
        />
      </main>
    </>
  );
}
