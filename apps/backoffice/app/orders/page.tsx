"use client";

import type { OrderDto, OrderStatus, ProductDto } from "@ebay-order-management/shared";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Form,
  Image,
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
import {
  mediaUrl,
  createOrder,
  getToken,
  listOrders,
  listProducts,
  listUsers,
  updateOrder,
  updateOrderStatus,
} from "@/lib/api";
import { productOptions, searchable, userOptions } from "@/lib/selectOptions";

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
  productId?: string;
  quantity: number;
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
  productId: undefined,
  quantity: 1,
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
  const formProductId = Form.useWatch("productId", form);
  const formProduct = formProductId ? productById.get(formProductId) : undefined;

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
        productId: order.productId,
        quantity: order.quantity,
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
    setFormError(null);
    setSubmitting(true);
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
        await updateOrder(editingOrderId, { ...common, productId: values.productId as string });
      } else {
        await createOrder({ ...common, productId: values.productId as string, quantity: Number(values.quantity) });
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
      title: "Image",
      key: "image",
      render: (_, order) => {
        const product = productById.get(order.productId);
        return product?.imageUrl ? (
          <Image src={mediaUrl(product.imageUrl)} alt={product.title} width={40} height={40} className="rounded object-cover" />
        ) : (
          <Avatar shape="square" size={40}>
            —
          </Avatar>
        );
      },
    },
    { title: "SKU", key: "sku", render: (_, o) => productById.get(o.productId)?.sku ?? "—" },
    { title: "Product", key: "product", render: (_, o) => productById.get(o.productId)?.title ?? "—" },
    {
      title: "Source",
      key: "source",
      render: (_, o) => {
        const product = productById.get(o.productId);
        return product ? (SOURCE_LABEL[product.fulfillmentType] ?? product.fulfillmentType) : "—";
      },
    },
    { title: "Date", dataIndex: "orderDate", sorter: (a, b) => a.orderDate.localeCompare(b.orderDate) },
    { title: "Order #", dataIndex: "ebayOrderRef" },
    { title: "Tracking #", dataIndex: "trackingNumber", render: (v) => v ?? "—" },
    { title: "Qty", dataIndex: "quantity" },
    { title: "Payout", dataIndex: "ebayNetProceeds", render: (v: number) => `$${v.toFixed(2)}` },
    {
      title: "Buy Price",
      dataIndex: "buyPriceSnapshot",
      render: (v: number | null) => (v != null ? `$${v.toFixed(2)}` : "Pending"),
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

              <div className="flex items-start gap-3">
                <Form.Item name="productId" label="Product" rules={[{ required: true, message: "Select a product" }]} className="flex-1">
                  <Select showSearch={searchable} placeholder="Select…" options={productOptions(products)} />
                </Form.Item>
                <Form.Item name="quantity" label="Qty" rules={[{ required: true }]} className="w-24">
                  <InputNumber disabled={!!editingOrderId} min={1} precision={0} className="w-full" />
                </Form.Item>
                {formProduct?.imageUrl && (
                  <Avatar shape="square" size={40} src={mediaUrl(formProduct.imageUrl)} className="mt-7 shrink-0" />
                )}
              </div>

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

              {formProduct?.fulfillmentType === "DROPSHIP" && (
                <Form.Item name="supplierUrl" label="Supplier/product listing URL (optional)">
                  <Input placeholder="https://…" />
                </Form.Item>
              )}

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting}>
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
