"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";

/**
 * "Aurora" theme: blue does the functional work (buttons, links, focus, form controls); mint and lavender are
 * decorative only. Gradients (sidebar, hero KPI card, primary button) live in globals.css since tokens take flat colors.
 */
const theme = {
  token: {
    colorPrimary: "#3b82f6",
    colorLink: "#2563eb",
    colorInfo: "#3b82f6",
    colorSuccess: "#10b981",
    colorBgLayout: "#f1f6ff",
    colorBorderSecondary: "#e3e8f2",
    borderRadius: 8,
    fontFamily: "var(--font-jakarta), system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  components: {
    Menu: {
      itemBg: "transparent",
      itemColor: "#3f4b63",
      itemSelectedBg: "rgba(255, 255, 255, 0.85)",
      itemSelectedColor: "#2563eb",
      itemHoverBg: "rgba(255, 255, 255, 0.55)",
    },
    Table: { headerBg: "#f7f9fd" },
  },
};

/** Registers antd's CSS-in-JS for SSR, applies the app theme, and provides App context for message/modal hooks. */
export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry layer>
      <ConfigProvider theme={theme}>
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
