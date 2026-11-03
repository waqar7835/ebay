/**
 * "3PL is no longer attached to this product" warnings (decided 2026-11-03): a save or status change that should have
 * moved stock at a 3PL no longer on the product moves nothing and returns these, asking the admin to adjust the
 * quantity by hand. The order edit page leaves for the orders list right after saving, so it hands them over here.
 */
const KEY = "orderStockWarnings";

export function passStockWarnings(warnings: string[] | undefined) {
  if (!warnings?.length) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(warnings));
  } catch {
    // Storage blocked: the warnings are lost, the save itself went through.
  }
}

export function takeStockWarnings(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}
