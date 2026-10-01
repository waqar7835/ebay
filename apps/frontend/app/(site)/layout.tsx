import "@/styles/site.css";
import SiteSettingsProvider from "@/components/site/SiteSettingsProvider";
import SiteTheme from "@/components/site/SiteTheme";
import { bricolage } from "@/lib/fonts";
import { getSiteSettings } from "@/lib/siteSettings";

/** Public pages (marketing + auth): Partners design, scoped under .site so the app screens keep their own theme. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteSettings();
  return (
    <SiteSettingsProvider value={site}>
      <SiteTheme>
        <div className={`site ${bricolage.variable}`}>{children}</div>
      </SiteTheme>
    </SiteSettingsProvider>
  );
}
