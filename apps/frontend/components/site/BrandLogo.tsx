"use client";

import Link from "next/link";
import { mediaUrl } from "@/lib/api";
import { ROLE_COLORS } from "@/lib/brand";
import { useSiteSettings } from "./SiteSettingsProvider";

/** The uploaded logo (or four role-colored squares when none is set) + the brand name. */
export default function BrandLogo({ href = "/" }: { href?: string }) {
  const { brandName, logoUrl } = useSiteSettings();
  return (
    <Link className="logo" href={href} aria-label={`${brandName} home`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="logo-img" src={mediaUrl(logoUrl)} alt="" />
      ) : (
        <b aria-hidden>
          <i style={{ background: ROLE_COLORS.accountHolder }} />
          <i style={{ background: ROLE_COLORS.stockOwner }} />
          <i style={{ background: ROLE_COLORS.threePl }} />
          <i style={{ background: ROLE_COLORS.admin }} />
        </b>
      )}
      {brandName}
    </Link>
  );
}
