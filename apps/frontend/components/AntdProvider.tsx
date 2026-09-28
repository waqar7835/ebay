"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";

/** Registers antd's CSS-in-JS for SSR, applies the app theme, and provides App context for message/modal hooks. */
export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry layer>
      <ConfigProvider theme={{ token: { colorPrimary: "#111827", borderRadius: 4 } }}>
        <App>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
