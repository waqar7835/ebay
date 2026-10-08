import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AntdProvider from "@/components/AntdProvider";
import { mediaUrl } from "@/lib/api";
import { getSiteSettings } from "@/lib/siteSettings";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  // The platform favicon, else the platform logo (set on /settings).
  const icon = mediaUrl(site?.faviconUrl ?? site?.logoUrl);
  return {
    title: "eBay Order Management — Backoffice",
    description: "Admin backoffice for eBay order management",
    ...(icon ? { icons: { icon } } : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  );
}
