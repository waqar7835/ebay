import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZES } from "@ebay-order-management/shared";

export interface Paging {
  page: number;
  pageSize: number;
  offset: number;
}

/**
 * Reads `?page=&pageSize=` for the paged lists. Returns null when neither is sent, so callers that want the whole
 * list (pickers, dashboards) keep getting a plain array. Page is 1-based; pageSize is clamped to 1..250.
 */
export function parsePaging(page?: string, pageSize?: string): Paging | null {
  if (page == null && pageSize == null) return null;
  const max = LIST_PAGE_SIZES[LIST_PAGE_SIZES.length - 1];
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const size = Math.min(max, Math.max(1, Math.floor(Number(pageSize)) || DEFAULT_LIST_PAGE_SIZE));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

/** Escapes LIKE wildcards so user text is matched literally. */
export function likeContains(text: string) {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
