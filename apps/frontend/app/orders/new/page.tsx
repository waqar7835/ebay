"use client";

import type { ProductDto, UserDto } from "@ebay-order-management/shared";
import { Alert, Avatar, Button, Card, Form, Input, InputNumber, Select } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import DateField from "@/components/DateField";
import FileUpload from "@/components/FileUpload";
import { createOrder, getToken, listProducts, listUsers, localDateOnly, mediaUrl, uploadOrderShippingLabel } from "@/lib/api";
import { productOptions, searchable, userOptions } from "@/lib/selectOptions";

function todayIsoDate() {
  return localDateOnly();
}

interface NewOrderValues {
  accountHolderId: string;
  productId: string;
  quantity: number;
  threePlId?: string;
  orderDate: string;
  ebayOrderRef: string;
  trackingNumber?: string;
  buyerDetails: string;
  ebayNetProceeds: number;
  shippingCost: number;
  supplierUrl?: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [form] = Form.useForm<NewOrderValues>();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
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
  }, [router]);

  const productId = Form.useWatch("productId", form);
  const accountHolders = users.filter((u) => u.roles.includes("ACCOUNT_HOLDER" as never));
  const productById = new Map(products.map((p) => [p.id, p]));
  const selectedProduct = productId ? productById.get(productId) : undefined;
  const eligibleThreePls = users.filter(
    (u) => u.roles.includes("THREE_PL" as never) && u.threePlProfile?.fulfillmentType === selectedProduct?.fulfillmentType,
  );

  function handleProductChange(id: string) {
    form.setFieldValue("threePlId", productById.get(id)?.threePlId ?? undefined);
  }

  async function handleFinish(values: NewOrderValues) {
    setFormError(null);
    setSubmitting(true);
    try {
      const order = await createOrder({
        accountHolderId: values.accountHolderId,
        productId: values.productId,
        quantity: Number(values.quantity),
        threePlId: values.threePlId || undefined,
        orderDate: values.orderDate,
        ebayOrderRef: values.ebayOrderRef,
        trackingNumber: values.trackingNumber || undefined,
        buyerDetails: values.buyerDetails,
        ebayNetProceeds: Number(values.ebayNetProceeds ?? 0),
        shippingCost: Number(values.shippingCost ?? 0),
        supplierUrl: values.supplierUrl || undefined,
      });
      if (shippingLabel) {
        await uploadOrderShippingLabel(order.id, shippingLabel);
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
        <h1 className="text-2xl font-semibold">New order</h1>

        <Card className="mt-6">
          <Form<NewOrderValues>
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            initialValues={{ quantity: 1, orderDate: todayIsoDate(), ebayNetProceeds: 0, shippingCost: 0 }}
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
              <Form.Item name="productId" label="Product" rules={[{ required: true, message: "Select a product" }]} className="flex-1">
                <Select showSearch={searchable} placeholder="Select…" options={productOptions(products)} onChange={handleProductChange} />
              </Form.Item>
              <Form.Item name="quantity" label="Qty" rules={[{ required: true }]} className="w-24">
                <InputNumber min={1} precision={0} className="w-full" />
              </Form.Item>
              {selectedProduct?.imageUrl && (
                <Avatar shape="square" size={40} src={mediaUrl(selectedProduct.imageUrl)} className="mt-7 shrink-0" />
              )}
            </div>

            {selectedProduct && (
              <Form.Item
                name="threePlId"
                label={`3PL ${selectedProduct.fulfillmentType === "STOCK" ? "" : "(optional)"}`}
                rules={[{ required: selectedProduct.fulfillmentType === "STOCK", message: "Select a 3PL" }]}
                extra={
                  eligibleThreePls.length === 0
                    ? `No 3PL users are set up for ${selectedProduct.fulfillmentType === "STOCK" ? "Stock" : "Dropshipping"} fulfillment yet.`
                    : undefined
                }
              >
                <Select
                  showSearch={searchable}
                  allowClear={selectedProduct.fulfillmentType !== "STOCK"}
                  placeholder={selectedProduct.fulfillmentType === "STOCK" ? "Select…" : "None"}
                  options={userOptions(eligibleThreePls)}
                />
              </Form.Item>
            )}

            {selectedProduct?.fulfillmentType === "DROPSHIP" && (
              <Form.Item name="supplierUrl" label="Supplier/product listing URL (optional)">
                <Input placeholder="https://…" />
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

            <Form.Item label="Shipping label (PDF)">
              <FileUpload value={shippingLabel} onChange={setShippingLabel} accept="application/pdf" label="Select PDF" />
            </Form.Item>

            {formError && <Alert type="error" title={formError} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={submitting}>
              {submitting ? "Creating..." : "Create order"}
            </Button>
          </Form>
        </Card>
      </main>
    </>
  );
}
