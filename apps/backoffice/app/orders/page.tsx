"use client";

import type { OrderDto, OrderStatus, ProductDto } from "@ebay-order-management/shared";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
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
  listOrders,
  listProducts,
  listUsers,
  updateOrder,
  updateOrderStatus,
} from "@/lib/api";
import { searchable, userOptions } from "@/lib/selectOptions";

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
}

function todayIsoDate() {
  // Local date parts: toISOString() gives yesterday's date east of UTC in the early-morning hours.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface OrderFormValues {
  accountHolderId?: string;
  // Several products only for STOCK products at the same 3PL (the 3PL comes from the products); DROPSHIP has one.
  items: { productId?: string; quantity: number }[];
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
  }, [router]);

  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER"));
  const productById = new Map(products.map((p) => [p.id, p]));
  const formRows: OrderFormValues["items"] = Form.useWatch("items", form) ?? [];
  const formProducts = formRows.map((r) => (r?.productId ? productById.get(r.productId) : undefined));
  const firstProduct = formProducts.find(Boolean);
  const isDropship = firstProduct?.fulfillmentType === "DROPSHIP";
  const firstWarehouse = formProducts.find((p) => p?.fulfillmentType === "STOCK")?.threePlId;
  const mixedWarehouses = new Set(formProducts.filter((p) => p?.fulfillmentType === "STOCK").map((p) => p!.threePlId)).size > 1;
  const editingOrder = editingOrderId ? orders.find((o) => o.id === editingOrderId) : undefined;

  /** Options for one item row: other rows' products hidden; with several rows only Stock products at the same 3PL. */
  function productOptionsFor(index: number) {
    const others = formRows.map((r, i) => (i === index ? undefined : r?.productId)).filter(Boolean);
    return products
      .filter((p) => !others.includes(p.id))
      .map((p) => ({
        value: p.id,
        label: `${p.sku} — ${p.title} (${p.fulfillmentType === "DROPSHIP" ? "Dropshipping" : "Stock"})`,
        disabled:
          (formRows.length > 1 && p.fulfillmentType === "DROPSHIP") ||
          (others.length > 0 && !!firstWarehouse && p.threePlId !== firstWarehouse),
        product: p,
      }));
  }

  function openForm(values: OrderFormValues, orderId: string | null) {
    setEditingOrderId(orderId);
    setFormError(null);
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
        items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderDate: order.orderDate,
        ebayOrderRef: order.ebayOrderRef,
        trackingNumber: order.trackingNumber ?? "",
        buyerDetails: order.buyerDetails,
        ebayNetProceeds: order.ebayNetProceeds,
        shippingCost: order.shippingCost,
        supplierUrl: order.supplierUrl ?? "",
      },
      order.id,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingOrderId(null);
  }

  async function handleFinish(values: OrderFormValues) {
    if (mixedWarehouses) return;
    setFormError(null);
    setSubmitting(true);
    const items = values.items.map((r) => ({ productId: r.productId as string, quantity: Number(r.quantity) }));
    // On edit, only send items when they changed — re-sending re-validates products already on the order.
    const itemsChanged =
      !editingOrder ||
      items.length !== editingOrder.items.length ||
      items.some((r, i) => r.productId !== editingOrder.items[i]?.productId || r.quantity !== editingOrder.items[i]?.quantity);
    const common = {
      accountHolderId: values.accountHolderId as string,
      orderDate: values.orderDate,
      ebayOrderRef: values.ebayOrderRef,
      trackingNumber: values.trackingNumber || undefined,
      buyerDetails: values.buyerDetails,
      ebayNetProceeds: Number(values.ebayNetProceeds ?? 0),
      shippingCost: Number(values.shippingCost ?? 0),
      supplierUrl: values.supplierUrl || undefined,
    };
    try {
      if (editingOrderId) {
        await updateOrder(editingOrderId, { ...common, ...(itemsChanged ? { items } : {}) });
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
    { title: "Date", dataIndex: "orderDate", sorter: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    { title: "Order #", dataIndex: "ebayOrderRef" },
    { title: "Tracking #", dataIndex: "trackingNumber", render: (v) => v ?? "—" },
    { title: "Qty", key: "qty", render: (_, o) => o.items.reduce((sum, i) => sum + i.quantity, 0) },
    { title: "Payout", dataIndex: "ebayNetProceeds", render: (v: number) => `$${v.toFixed(2)}` },
    {
      title: "Buy Price",
      key: "buyPrice",
      // Buy price × qty across the items; pending while a dropship item awaits its buy price.
      render: (_, o) =>
        o.items.some((i) => i.buyPriceSnapshot == null)
          ? "Pending"
          : `$${o.items.reduce((sum, i) => sum + i.buyPriceSnapshot! * i.quantity, 0).toFixed(2)}`,
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
                  <Select showSearch={searchable} placeholder="Select…" options={userOptions(accountHolders)} />
                </Form.Item>
              </div>

              <Form.Item label="Products" required tooltip="The 3PL fee is charged once per order, however many products it has">
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
                                  {product.sellPrice != null && ` · Sell $${product.sellPrice.toFixed(2)} / unit`}
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
                      {!isDropship && (
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} block>
                          Add product
                        </Button>
                      )}
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
                <Form.Item name="ebayNetProceeds" label="Payout (net profit from eBay)" className="flex-1">
                  <InputNumber prefix="$" step={0.01} className="w-full" />
                </Form.Item>
                <Form.Item name="shippingCost" label="Shipping label cost (optional)" className="flex-1">
                  <InputNumber prefix="$" min={0} step={0.01} className="w-full" />
                </Form.Item>
              </div>

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
