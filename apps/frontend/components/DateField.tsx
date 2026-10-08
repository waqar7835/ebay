"use client";

import { DatePicker } from "antd";
import dayjs from "dayjs";
import { DATE_FORMAT } from "@/lib/date";

interface DateFieldProps {
  /** ISO date-only string (YYYY-MM-DD), or "" / undefined for empty. */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
  disabled?: boolean;
}

/** antd DatePicker that reads/writes the YYYY-MM-DD strings the API uses, so it drops into Form.Item or controlled state. */
export default function DateField({ value, onChange, placeholder, allowClear = true, className, disabled }: DateFieldProps) {
  return (
    <DatePicker
      className={className}
      // Wide enough for the longest month ("30 September 2026") without clipping.
      style={{ minWidth: 175 }}
      placeholder={placeholder}
      allowClear={allowClear}
      disabled={disabled}
      // Shows "08 October 2026"; typing an ISO or DD/MM/YYYY date still parses.
      format={[DATE_FORMAT, "YYYY-MM-DD", "DD/MM/YYYY"]}
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange?.(d ? d.format("YYYY-MM-DD") : "")}
    />
  );
}
