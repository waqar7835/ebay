"use client";

import { Checkbox, Form, InputNumber } from "antd";

/**
 * 3PL auto-delivery setting (decided 2026-10-08): off by default; once ticked, a number of delivery days. Orders the 3PL
 * marks shipped from then on are set to DELIVERED after that many days (a Stock order once it has a tracking number).
 */
export default function AutoDeliveryFields({
  enabled,
  onEnabledChange,
  days,
  onDaysChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  days: number | null;
  onDaysChange: (days: number | null) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-2">
      <Checkbox checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} className="mt-1">
        Enable auto-delivery
      </Checkbox>
      {enabled && (
        <Form.Item
          label="Delivery days"
          tooltip="Orders this 3PL marks as shipped from now on are set to Delivered after this many days (Stock orders once they have a tracking number)."
          required
          validateStatus={!days ? "error" : undefined}
          help={!days ? "Enter the number of days" : undefined}
          className="mb-0"
        >
          <InputNumber min={1} max={365} precision={0} suffix="days" value={days} onChange={(v) => onDaysChange(v == null ? null : Number(v))} className="w-40" />
        </Form.Item>
      )}
    </div>
  );
}
