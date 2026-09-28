"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser } from "@/lib/api";
import { ROLE_THEMES, themeIdForRoles, type RoleThemeId } from "@/lib/roleTheme";

/**
 * Role themes: the logged-in role picks the palette (Admin and logged-out pages get "Aurora"). The primary color does
 * the functional work (buttons, links, focus, form controls); the other colors are decorative only. Gradients
 * (sidebar, hero KPI card, primary button) live in globals.css since tokens take flat colors.
 */
function buildTheme(id: RoleThemeId) {
  const { primary, link, bgLayout } = ROLE_THEMES[id];
  return {
    token: {
      colorPrimary: primary,
      colorLink: link,
      colorInfo: primary,
      colorSuccess: "#10b981",
      colorBgLayout: bgLayout,
      colorBorderSecondary: "#e3e8f2",
      borderRadius: 8,
      fontFamily: "var(--font-jakarta), system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    components: {
      Menu: {
        itemBg: "transparent",
        itemColor: "#3f4b63",
        itemSelectedBg: "rgba(255, 255, 255, 0.85)",
        itemSelectedColor: link,
        itemHoverBg: "rgba(255, 255, 255, 0.55)",
      },
      Table: { headerBg: "#f7f9fd" },
    },
  };
}

/** Registers antd's CSS-in-JS for SSR, applies the role's theme, and provides App context for message/modal hooks. */
export default function AntdProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [themeId, setThemeId] = useState<RoleThemeId>("aurora");

  // Re-read on every navigation so login (push to /dashboard) and logout (push to /) switch the palette.
  useEffect(() => {
    const id = themeIdForRoles(getStoredUser()?.roles);
    setThemeId(id);
    if (id === "aurora") delete document.documentElement.dataset.roleTheme;
    else document.documentElement.dataset.roleTheme = id;
  }, [pathname]);

  const theme = useMemo(() => buildTheme(themeId), [themeId]);

  return (
    <AntdRegistry layer>
      <ConfigProvider theme={theme}>
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
