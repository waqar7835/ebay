"use client";

import { useParams } from "next/navigation";
import InvoiceWizard from "@/components/InvoiceWizard";

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  return <InvoiceWizard invoiceId={id} />;
}
