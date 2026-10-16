"use client";

import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZES } from "@ebay-order-management/shared";
import { useEffect } from "react";

/**
 * List pages (Orders, Products, Users) keep their filters and paging in the URL, so a reload keeps them, and remember
 * that query per list (sessionStorage) so a form page's Back / Save returns to the same filtered view (`listHref`).
 */
const storageKey = (path: string) => `listQuery:${path}`;

/** The list's URL as last seen in this tab (filters + page), or the bare path. */
export function listHref(path: string): string {
  try {
    const query = sessionStorage.getItem(storageKey(path));
    return query ? `${path}?${query}` : path;
  } catch {
    return path;
  }
}

/**
 * Query string from a list's state. Empty values are left out, except keys in `keepEmpty` — for a filter whose default
 * isn't empty (e.g. the orders date range), "" in the URL means the user cleared it.
 */
export function buildListQuery(values: Record<string, string | number | null | undefined>, keepEmpty: string[] = []) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value != null && value !== "") params.set(key, String(value));
    else if (keepEmpty.includes(key)) params.set(key, "");
  }
  return params.toString();
}

/** Page and page size from the URL (1 / the default size when missing or invalid). */
export function readPaging(params: URLSearchParams | { get(key: string): string | null }) {
  const page = Number(params.get("page"));
  const size = Number(params.get("pageSize"));
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (LIST_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_LIST_PAGE_SIZE,
  };
}

/** Paging for the URL: left out while it's the default. */
export function pagingQuery(page: number, pageSize: number) {
  return { page: page > 1 ? page : undefined, pageSize: pageSize !== DEFAULT_LIST_PAGE_SIZE ? pageSize : undefined };
}

/**
 * Writes the list's query into the URL and remembers it for `listHref`. history.replaceState (which Next keeps in sync
 * with useSearchParams) rather than router.replace: no new history entry and no navigation per filter change.
 */
export function useListUrl(path: string, query: string, ready = true) {
  useEffect(() => {
    if (!ready) return;
    if (window.location.search.replace(/^\?/, "") !== query)
      window.history.replaceState(window.history.state, "", query ? `${path}?${query}` : path);
    try {
      sessionStorage.setItem(storageKey(path), query);
    } catch {
      // Private mode / blocked storage: the URL still keeps the filters on reload.
    }
  }, [path, query, ready]);
}
