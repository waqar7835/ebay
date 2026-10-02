"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Nav from "@/components/Nav";
import InvoiceTemplateEditor from "@/components/InvoiceTemplateEditor";

export default function NewInvoiceTemplatePage() {
  return (
    <Suspense fallback={null}>
      <NewInvoiceTemplate />
    </Suspense>
  );
}

function NewInvoiceTemplate() {
  const from = useSearchParams().get("from") ?? undefined;
  return (
    <>
      <Nav />
      <main className="ml-56 p-8 pb-16 xl:pb-8">
        <InvoiceTemplateEditor fromId={from} />
      </main>
    </>
  );
}
