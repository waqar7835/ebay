"use client";

import type { OrderDto } from "@ebay-order-management/shared";
import { Alert } from "antd";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import OrderForm from "@/components/OrderForm";
import { isInvoiced } from "@/components/InvoiceStatusTags";
import { getToken, listOrders, updateOrder, uploadOrderShippingLabel } from "@/lib/api";

export default function EditOrderPage() {
  const router = useRouter();
  const { id: orderId } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
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

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <BackLink href="/orders" label="Orders" title="Edit order" />

        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        {order && isInvoiced(order) && (
          <Alert
            type="warning"
            title="This order is on an invoice and can't be edited. Delete (or void) that invoice first, then edit and re-invoice."
            className="mt-4"
            showIcon
          />
        )}

        {order && !isInvoiced(order) && (
          <OrderForm
            initial={order}
            submitLabel="Save changes"
            submittingLabel="Saving..."
            onSubmit={async (payload, shippingLabel) => {
              await updateOrder(orderId, payload);
              if (shippingLabel) await uploadOrderShippingLabel(orderId, shippingLabel);
              router.push("/orders");
            }}
          />
        )}
      </main>
    </>
  );
}
