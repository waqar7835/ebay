"use client";

import type { OrderDto, ProductDto, UserDto } from "@ebay-order-management/shared";
import { Alert, Avatar, Button, Card, Form, Input, InputNumber, Select } from "antd";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import DateField from "@/components/DateField";
import FileUpload from "@/components/FileUpload";
import { getToken, listOrders, listProducts, listUsers, mediaUrl, updateOrder, uploadOrderShippingLabel } from "@/lib/api";
import { searchable, userOptions } from "@/lib/selectOptions";

interface EditOrderValues {
  accountHolderId: string;
  orderDate: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost: number;
  supplierUrl?: string;
}

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [form] = Form.useForm<EditOrderValues>();

  const [order, setOrder] = useState<OrderDto | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shippingLabel, setShippingLabel] = useState<File | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    listProducts().then(setProducts).catch(() => undefined);
    listUsers().then(setUsers).catch(() => undefined);
    listOrders()
      .then((orders) => {
        const found = orders.find((o) => o.id === orderId);
        if (!found) {
          setLoadError("Order not found");
          return;
        }
        setOrder(found);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load order"));
  }, [router, orderId]);

  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER" as never));
  const product = order ? products.find((p) => p.id === order.productId) : undefined;

  async function handleFinish(values: EditOrderValues) {
    setFormError(null);
    setSubmitting(true);
    try {
      await updateOrder(orderId, {
        accountHolderId: values.accountHolderId,
        orderDate: values.orderDate,
        ebayOrderRef: values.ebayOrderRef,
        trackingNumber: values.trackingNumber || undefined,
        buyerDetails: values.buyerDetails,
        ebayNetProceeds: Number(values.ebayNetProceeds ?? 0),
        shippingCost: Number(values.shippingCost ?? 0),
        supplierUrl: values.supplierUrl || undefined,
      });
      if (shippingLabel) {
        await uploadOrderShippingLabel(orderId, shippingLabel);
      }
      router.push("/orders");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save order");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-3xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit order</h1>
          <Button onClick={() => router.push("/orders")}>Back to orders</Button>
        </div>

        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        {order && (
          <Card className="mt-6">
            <Form<EditOrderValues>
              form={form}
              layout="vertical"
              onFinish={handleFinish}
              initialValues={{
                accountHolderId: order.accountHolderId,
                orderDate: order.orderDate,
                ebayOrderRef: order.ebayOrderRef,
                trackingNumber: order.trackingNumber ?? "",
                buyerDetails: order.buyerDetails,
                ebayNetProceeds: order.ebayNetProceeds,
                shippingCost: order.shippingCost,
                supplierUrl: order.supplierUrl ?? "",
              }}
            >
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

              <div className="mb-6 flex items-center gap-3 rounded bg-gray-50 p-3">
                <Avatar shape="square" size={36} src={product?.imageUrl ? mediaUrl(product.imageUrl) : undefined}>
                  —
                </Avatar>
                <p className="text-gray-600">
                  {product ? `${product.sku} — ${product.title}` : "—"} · Qty {order.quantity}
                </p>
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

              {product?.fulfillmentType === "DROPSHIP" && (
                <Form.Item name="supplierUrl" label="Supplier/product listing URL (optional)">
                  <Input placeholder="https://…" />
                </Form.Item>
              )}

              <Form.Item
                label="Shipping label (PDF)"
                extra={
                  order.shippingLabelUrl && (
                    <a href={mediaUrl(order.shippingLabelUrl)} target="_blank" rel="noreferrer">
                      View current shipping label
                    </a>
                  )
                }
              >
                <FileUpload value={shippingLabel} onChange={setShippingLabel} accept="application/pdf" label="Select PDF" />
              </Form.Item>

              {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
              <Button type="primary" htmlType="submit" loading={submitting}>
                {submitting ? "Saving..." : "Save changes"}
              </Button>
            </Form>
          </Card>
        )}
      </main>
    </>
  );
}
