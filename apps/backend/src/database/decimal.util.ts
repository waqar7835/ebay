export function toDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value as string);
}

export function toNullableDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : parseFloat(value as string);
}
