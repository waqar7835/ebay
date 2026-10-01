"use client";

import { ConfigProvider } from "antd";

/** antd tokens for the public pages: ink primary and the larger, rounder controls of the Partners design. */
const SITE_THEME = {
  token: {
    colorPrimary: "#151827",
    colorLink: "#151827",
    colorText: "#151827",
    colorTextPlaceholder: "#9a9eb2",
    colorBorder: "#e6e7ef",
    borderRadius: 12,
    controlHeight: 48,
    fontSize: 15,
    fontFamily: "var(--font-jakarta), system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  components: {
    Form: { labelColor: "#6b7086", labelFontSize: 13, verticalLabelPadding: "0 0 6px" },
    Button: { fontWeight: 700, primaryShadow: "none" },
  },
};

export default function SiteTheme({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={SITE_THEME}>{children}</ConfigProvider>;
}
