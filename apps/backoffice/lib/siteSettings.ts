import type { PublicSiteDto } from "@ebay-order-management/shared";
import { unstable_cache } from "next/cache";
import { cache } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function loadSiteSettings(): Promise<PublicSiteDto | null> {
  try {
    // Plain fetch with a short timeout so a down API never stalls the page; cached by unstable_cache below.
    const res = await fetch(`${API_URL}/public/site`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return res.ok ? ((await res.json()) as PublicSiteDto) : null;
  } catch {
    return null;
  }
}

/** Server-side read of the public site settings (used for the favicon), cached for a minute; null when the API is down. */
export const getSiteSettings = cache(unstable_cache(loadSiteSettings, ["public-site-settings"], { revalidate: 60 }));
