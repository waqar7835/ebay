/** Helpers for antd <Select> lists over dynamic data (users/products/companies): every such list is searchable by its label. */

export const searchable = { optionFilterProp: "label" } as const;

export function userLabel(u: { name?: string | null; email: string } | undefined): string {
  if (!u) return "—";
  return u.name ? `${u.name} (${u.email})` : u.email;
}

export function userOptions(users: { id: string; name?: string | null; email: string }[]) {
  return users.map((u) => ({ value: u.id, label: userLabel(u) }));
}

export function productOptions(products: { id: string; sku: string; title: string; fulfillmentType: string }[]) {
  return products.map((p) => ({
    value: p.id,
    label: `${p.sku} — ${p.title} (${p.fulfillmentType === "DROPSHIP" ? "Dropshipping" : "Stock"})`,
  }));
}
