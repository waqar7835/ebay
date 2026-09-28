import { Tag } from "antd";

/** Light, plain per-role colors (bg / text / border), taken from each role's portal theme. */
const ROLE_STYLES: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  SUPER_ADMIN: { label: "Super Admin", bg: "#eef2ff", fg: "#4338ca", border: "#c7d2fe" },
  PLATFORM_STAFF: { label: "Platform Staff", bg: "#fdf4ff", fg: "#a21caf", border: "#f5d0fe" },
  ADMIN: { label: "Admin", bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  STAFF: { label: "Staff", bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" },
  ACCOUNT_HOLDER: { label: "Account Holder", bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" },
  STOCK_OWNER: { label: "Stock Owner", bg: "#faf5ff", fg: "#7e22ce", border: "#e9d5ff" },
  THREE_PL: { label: "3PL", bg: "#ecfeff", fg: "#0e7490", border: "#a5f3fc" },
};

/** Human-readable role name, e.g. "Account Holder" for ACCOUNT_HOLDER. */
export function roleLabel(role: string): string {
  return ROLE_STYLES[role]?.label ?? role;
}

export default function RoleTag({ role }: { role: string }) {
  const s = ROLE_STYLES[role];
  if (!s) return <Tag>{role}</Tag>;
  return (
    <Tag style={{ background: s.bg, color: s.fg, borderColor: s.border }} className="font-medium">
      {s.label}
    </Tag>
  );
}
