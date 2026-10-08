import dayjs from "dayjs";

/** App-wide display formats (decided 2026-10-08): "08 Oct 2026" and "08 Oct 2026, 14:35". */
export const DATE_FORMAT = "DD MMM YYYY";
export const DATE_TIME_FORMAT = "DD MMM YYYY, HH:mm";

/**
 * Formats a YYYY-MM-DD date-only string or an ISO timestamp for display. Date-only strings are read as calendar dates
 * (no time-zone shift).
 */
export function formatDate(value: string | Date | null | undefined, empty = "—") {
  return value ? dayjs(value).format(DATE_FORMAT) : empty;
}

export function formatDateTime(value: string | Date | null | undefined, empty = "—") {
  return value ? dayjs(value).format(DATE_TIME_FORMAT) : empty;
}
