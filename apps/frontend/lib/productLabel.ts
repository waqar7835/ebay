type Labelled = { title: string; color?: string | null; size?: string | null };

/** "Red / M" — a product's color and size, which tell its variations apart (empty when it has neither). */
export function variationName(p: Pick<Labelled, "color" | "size"> | undefined): string {
  return [p?.color, p?.size].filter((v) => v?.trim()).join(" / ");
}

/** "T-shirt (Red / M)", or just the title when the product has no color or size. */
export function productLabel(p: Labelled): string {
  const name = variationName(p);
  return name ? `${p.title} (${name})` : p.title;
}
