"use client";

import type { PublicSiteDto } from "@ebay-order-management/shared";
import { createContext, useContext } from "react";
import { DEFAULT_SITE } from "@/lib/brand";

const SiteSettingsContext = createContext<PublicSiteDto>(DEFAULT_SITE);

/** Hands the server-loaded site settings to client components (header, logo, auth pages). */
export default function SiteSettingsProvider({ value, children }: { value: PublicSiteDto; children: React.ReactNode }) {
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): PublicSiteDto {
  return useContext(SiteSettingsContext);
}
