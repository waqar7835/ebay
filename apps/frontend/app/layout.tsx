import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AntdProvider from "@/components/AntdProvider";
import { ROLE_THEME_BOOT_SCRIPT } from "@/lib/roleTheme";
import { TAGLINE } from "@/lib/brand";
import { getSiteSettings } from "@/lib/siteSettings";
import { mediaUrl } from "@/lib/api";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export async function generateMetadata(): Promise<Metadata> {
  const { brandName, faviconUrl, logoUrl } = await getSiteSettings();
  // The uploaded favicon, else the site logo.
  const icon = mediaUrl(faviconUrl ?? logoUrl);
  return { title: { default: brandName, template: `%s · ${brandName}` }, description: TAGLINE, ...(icon ? { icons: { icon } } : {}) };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script sets data-role-theme on <html> before React hydrates.
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ROLE_THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  );
}
