"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import Nav from "@/components/Nav";
import OrderForm from "@/components/OrderForm";
import { createOrder, getToken, uploadOrderShippingLabel, type CreateOrderPayload } from "@/lib/api";

export default function NewOrderPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8">
        <BackLink href="/orders" label="Orders" title="New order" />

        <OrderForm
          submitLabel="Create order"
          submittingLabel="Creating..."
          onSubmit={async (payload, shippingLabel) => {
            const order = await createOrder(payload as CreateOrderPayload);
            if (shippingLabel) await uploadOrderShippingLabel(order.id, shippingLabel);
            router.push("/orders");
          }}
        />
      </main>
    </>
  );
}
