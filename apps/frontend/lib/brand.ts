import type { PublicSiteDto } from "@ebay-order-management/shared";

/** One-line product description used in page metadata and the footer. */
export const TAGLINE = "Orders, partner payouts and invoices for eBay reselling teams.";

/**
 * Used only when the API can't be reached. The real brand name, logo and contact details are set by the Super Admin
 * in the backoffice (Settings) and loaded from GET /public/site.
 */
export const DEFAULT_SITE: PublicSiteDto = {
  brandName: "OrderSplit",
  logoUrl: null,
  helloEmail: null,
  supportEmail: null,
  replyHours: [],
  replyTimezone: null,
};

/** Role accent colors used across the public pages (same hues as the in-app role themes). */
export const ROLE_COLORS = {
  admin: "#3b82f6",
  staff: "#2563eb",
  accountHolder: "#dc2626",
  stockOwner: "#9333ea",
  threePl: "#0891b2",
} as const;
