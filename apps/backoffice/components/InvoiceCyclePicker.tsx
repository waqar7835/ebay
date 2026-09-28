"use client";

import type { InvoiceCycleDto, Role } from "@ebay-order-management/shared";
import { Select } from "antd";
import { useEffect, useState } from "react";
import DateField from "@/components/DateField";
import { listInvoiceCycles } from "@/lib/api";

interface InvoiceCyclePickerProps {
  userId: string;
  role: Role;
  /** Selected cycle's periodStart. */
  value?: string;
  onChange: (periodStart: string | undefined) => void;
  /** Bump to refetch (e.g. after generating or deleting an invoice). */
  reloadKey?: number;
}

/**
 * Billing-cycle picker for invoice generation: the current cycle (default) or a previous one, with its
 * start/end dates shown like the Orders page filter. Cycles that already have an invoice are disabled.
 */
export default function InvoiceCyclePicker({ userId, role, value, onChange, reloadKey }: InvoiceCyclePickerProps) {
  const [cycles, setCycles] = useState<InvoiceCycleDto[]>([]);

  useEffect(() => {
    if (!userId || !role) {
      setCycles([]);
      onChange(undefined);
      return;
    }
    listInvoiceCycles(userId, role)
      .then((list) => {
        setCycles(list);
        const firstOpen = list.find((c) => !c.invoiceId);
        onChange(firstOpen?.periodStart);
      })
      .catch(() => setCycles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, reloadKey]);

  const selected = cycles.find((c) => c.periodStart === value);

  return (
    <div className="flex items-end gap-3">
      <label className="flex-1">
        Billing cycle
        <Select
          value={value}
          onChange={onChange}
          placeholder={userId ? "Select…" : "Select a user first"}
          disabled={!userId}
          options={cycles.map((c) => ({
            value: c.periodStart,
            disabled: !!c.invoiceId,
            label: `${c.isCurrent ? "Current cycle" : `${c.periodStart} – ${c.periodEnd}`}${c.invoiceId ? " (invoiced)" : ""}`,
          }))}
          className="mt-1 flex w-full"
        />
      </label>
      <label>
        Start date
        <DateField value={selected?.periodStart} disabled className="mt-1 flex" />
      </label>
      <label>
        End date
        <DateField value={selected?.periodEnd} disabled className="mt-1 flex" />
      </label>
    </div>
  );
}
