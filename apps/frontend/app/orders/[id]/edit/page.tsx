"use client";

import type { OrderDto, ProductDto, UserDto } from "@ebay-order-management/shared";
import { Alert, Avatar, Button, Card, Form, Input, InputNumber, Select } from "antd";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import DateField from "@/components/DateField";
import FileUpload from "@/components/FileUpload";
import { getToken, listOrders, listProducts, listUsers, mediaUrl, updateOrder, uploadOrderShippingLabel } from "@/lib/api";
import { productOptions, searchable, userOptions } from "@/lib/selectOptions";

interface EditOrderValues {
  accountHolderId: string;
  productId: string;
  threePlId?: string;
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

  const productId = Form.useWatch("productId", form);
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER" as never));
  const productById = new Map(products.map((p) => [p.id, p]));
  const product = productById.get(productId ?? order?.productId ?? "");
  // Switching product re-snapshots its prices/Stock Owner/3PL fees server-side, so the 3PL is only
  // re-picked when the product actually changes.
  const productChanged = !!order && !!productId && productId !== order.productId;
  const eligibleThreePls = users.filter(
    (u) => u.roles.includes("THREE_PL" as never) && u.threePlProfile?.fulfillmentType === product?.fulfillmentType,
  );

  function handleProductChange(id: string) {
    const next = productById.get(id);
    const keepThreePl = next?.fulfillmentType === "DROPSHIP" && order?.threePlId ? order.threePlId : undefined;
    form.setFieldValue("threePlId", next?.fulfillmentType === "STOCK" ? (next.threePlId ?? undefined) : keepThreePl);
  }

  async function handleFinish(values: EditOrderValues) {
    setFormError(null);
    setSubmitting(true);
    try {
      await updateOrder(orderId, {
        accountHolderId: values.accountHolderId,
        productId: values.productId,
        threePlId: productChanged ? values.threePlId || undefined : undefined,
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
        <BackLink href="/orders" label="Orders" />
        <h1 className="text-2xl font-semibold">Edit order</h1>

        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        {order && (
          <Card className="mt-6">
            <Form<EditOrderValues>
              form={form}
              layout="vertical"
              onFinish={handleFinish}
              initialValues={{
                accountHolderId: order.accountHolderId,
                productId: order.productId,
                threePlId: order.threePlId ?? undefined,
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

              <div className="flex items-start gap-3">
                <Form.Item
                  name="productId"
                  label={`Product (Qty ${order.quantity})`}
                  rules={[{ required: true, message: "Select a product" }]}
                  extra={productChanged ? "Prices, Stock Owner terms and 3PL fees will be re-copied from this product's current rates." : undefined}
                  className="flex-1"
                >
                  <Select showSearch={searchable} placeholder="Select…" options={productOptions(products)} onChange={handleProductChange} />
                </Form.Item>
                {product?.imageUrl && <Avatar shape="square" size={40} src={mediaUrl(product.imageUrl)} className="mt-7 shrink-0" />}
              </div>

              {productChanged && product && (
                <Form.Item
                  name="threePlId"
                  label={`3PL ${product.fulfillmentType === "STOCK" ? "" : "(optional)"}`}
                  rules={[{ required: product.fulfillmentType === "STOCK", message: "Select a 3PL" }]}
                  extra={
                    eligibleThreePls.length === 0
                      ? `No 3PL users are set up for ${product.fulfillmentType === "STOCK" ? "Stock" : "Dropshipping"} fulfillment yet.`
                      : undefined
                  }
                >
                  <Select
                    showSearch={searchable}
                    allowClear={product.fulfillmentType !== "STOCK"}
                    placeholder={product.fulfillmentType === "STOCK" ? "Select…" : "None"}
                    options={userOptions(eligibleThreePls)}
                  />
                </Form.Item>
              )}

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
