/** Helpers for antd <Select> lists over dynamic data (users/products/companies): every such list is searchable. */

import { roleLabel } from "@/components/RoleTag";

/** Matches the typed text against an option's `search` text (e.g. a user's email too), falling back to its label. */
export const searchable = {
  filterOption: (input: string, option?: { label?: unknown; search?: string }) =>
    String(option?.search ?? option?.label ?? "")
      .toLowerCase()
      .includes(input.trim().toLowerCase()),
};

type UserLike = { name?: string | null; email: string; roles?: string[] };

/**
 * "Name (Role)" — the role tells apart the separate accounts one person can hold (one per role, same
 * email). `role` overrides the user's own roles, e.g. an invoice's role. Falls back to the email when unnamed.
 */
export function userLabel(u: UserLike | undefined, role?: string): string {
  if (!u) return "—";
  const roles = role ? [role] : (u.roles ?? []);
  const who = u.name || u.email;
  return roles.length ? `${who} (${roles.map(roleLabel).join(", ")})` : who;
}

export function userOptions(users: ({ id: string } & UserLike)[]) {
  return users.map((u) => ({ value: u.id, label: userLabel(u), search: `${userLabel(u)} ${u.email}` }));
}

export function productOptions(products: { id: string; sku: string; title: string; fulfillmentType: string }[]) {
  return products.map((p) => ({
    value: p.id,
    label: `${p.sku} — ${p.title} (${p.fulfillmentType === "DROPSHIP" ? "Dropshipping" : "Stock"})`,
  }));
}
