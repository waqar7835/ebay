import type { PublicSiteDto } from "@ebay-order-management/shared";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { DEFAULT_SITE } from "./brand";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function loadSiteSettings(): Promise<PublicSiteDto> {
  try {
    // Plain (uncached) fetch with a short timeout: Next's fetch cache leaves unhandled rejections behind when the
    // API is down, which can stall the page. Caching is done by unstable_cache below instead.
    const res = await fetch(`${API_URL}/public/site`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) return DEFAULT_SITE;
    return { ...DEFAULT_SITE, ...((await res.json()) as PublicSiteDto) };
  } catch {
    return DEFAULT_SITE;
  }
}

/**
 * Server-side read of the public site settings (brand name, logo, contact details) from the backend, cached for a
 * minute. Falls back to DEFAULT_SITE when the API is unreachable (e.g. during a build without a backend).
 */
export const getSiteSettings = cache(unstable_cache(loadSiteSettings, ["public-site-settings"], { revalidate: 60 }));
