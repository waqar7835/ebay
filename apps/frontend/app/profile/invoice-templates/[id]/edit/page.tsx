"use client";

import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import InvoiceTemplateEditor from "@/components/InvoiceTemplateEditor";

export default function EditInvoiceTemplatePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Nav />
      <main className="ml-56 p-8 pb-16">
        <InvoiceTemplateEditor templateId={id} />
      </main>
    </>
  );
}
