import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AntdProvider from "@/components/AntdProvider";
import { ROLE_THEME_BOOT_SCRIPT } from "@/lib/roleTheme";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "eBay Order Management",
  description: "Seller dashboard for eBay order management",
};

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
