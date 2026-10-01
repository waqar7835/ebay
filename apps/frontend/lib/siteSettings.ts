import type { PublicSiteDto } from "@ebay-order-management/shared";
import { cache } from "react";
import { DEFAULT_SITE } from "./brand";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Server-side read of the public site settings (brand name, logo, contact details) from the backend, refreshed at
 * most once a minute. Falls back to DEFAULT_SITE when the API is unreachable (e.g. during a build without a backend).
 */
export const getSiteSettings = cache(async (): Promise<PublicSiteDto> => {
  try {
    const res = await fetch(`${API_URL}/public/site`, { next: { revalidate: 60 } });
    if (!res.ok) return DEFAULT_SITE;
    return { ...DEFAULT_SITE, ...((await res.json()) as PublicSiteDto) };
  } catch {
    return DEFAULT_SITE;
  }
});
