/** "Red / M" — a product's color and size, for telling variations apart (empty when it has neither). */
export function variationName(p: { color?: string | null; size?: string | null }): string {
  return [p.color, p.size].filter((v) => v?.trim()).join(" / ");
}

/**
 * The product's title, plus its color / size when it belongs to a family of variations ("T-shirt — Red / M"), so
 * variations sharing one title can be told apart. Products without variations keep their plain title.
 */
export function productLabel(p: { title: string; color?: string | null; size?: string | null }, inFamily: boolean): string {
  const name = inFamily ? variationName(p) : "";
  return name ? `${p.title} — ${name}` : p.title;
}
