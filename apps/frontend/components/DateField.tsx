"use client";

import { DatePicker } from "antd";
import dayjs from "dayjs";

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
      placeholder={placeholder}
      allowClear={allowClear}
      disabled={disabled}
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange?.(d ? d.format("YYYY-MM-DD") : "")}
    />
  );
}
