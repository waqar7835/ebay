import { Currency } from "@ebay-order-management/shared";

/** Short symbol shown as an input prefix for amounts entered in a user's own currency. */
export const CURRENCY_SYMBOL: Record<Currency, string> = {
  [Currency.GBP]: "£",
  [Currency.USD]: "$",
  [Currency.AUD]: "A$",
  [Currency.EUR]: "€",
  [Currency.CAD]: "C$",
};

const CURRENCY_NAME: Record<Currency, string> = {
  [Currency.GBP]: "British Pound",
  [Currency.USD]: "US Dollar",
  [Currency.AUD]: "Australian Dollar",
  [Currency.EUR]: "Euro",
  [Currency.CAD]: "Canadian Dollar",
};

export const currencyOptions = Object.values(Currency).map((c) => ({
  value: c,
  label: `${CURRENCY_SYMBOL[c]} ${c} — ${CURRENCY_NAME[c]}`,
}));

/** Prefix for an amount in the given currency; a missing currency means PKR (orders from before currencies). */
export function currencySymbol(currency: Currency | null | undefined): string {
  return currency ? CURRENCY_SYMBOL[currency] : "Rs";
}

/** Formats an amount in a user's own currency, e.g. "£12.50". */
export function money(value: number | null | undefined, currency: Currency | null | undefined, empty = "—"): string {
  return value != null ? `${currencySymbol(currency)}${Number(value).toFixed(2)}` : empty;
}

/** Order and dashboard amounts are always PKR (as are Stock Owner / 3PL invoices). */
export function pkr(value: number | null | undefined, empty = "—"): string {
  return value != null ? `Rs ${Number(value).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : empty;
}

/** Invoice amounts: PKR on Stock Owner / 3PL invoices, the Account Holder's own currency on theirs. */
export function invoiceMoney(value: number | null | undefined, currency: string, empty = "—"): string {
  return currency === "PKR" ? pkr(value, empty) : money(value, currency as Currency, empty);
}
