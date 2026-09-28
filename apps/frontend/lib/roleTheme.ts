import type { Role } from "@ebay-order-management/shared";

/**
 * Each portal role gets its own palette in the same multicolor style. Only the flat antd tokens live here; the
 * gradients and KPI tints are in globals.css under html[data-role-theme="<id>"] (Aurora is the :root default).
 */
export type RoleThemeId = "aurora" | "ocean" | "ember" | "orchid" | "lagoon";

interface RoleTheme {
  /** Functional color: buttons, focus, form controls. */
  primary: string;
  /** Slightly darker primary for links and the selected nav item. */
  link: string;
  bgLayout: string;
}

export const ROLE_THEMES: Record<RoleThemeId, RoleTheme> = {
  aurora: { primary: "#3b82f6", link: "#2563eb", bgLayout: "#f1f6ff" },
  ocean: { primary: "#2563eb", link: "#2157cf", bgLayout: "#f3f8fe" },
  ember: { primary: "#dc2626", link: "#c22121", bgLayout: "#fff8f3" },
  orchid: { primary: "#9333ea", link: "#812dce", bgLayout: "#fbf8ff" },
  lagoon: { primary: "#0891b2", link: "#07809d", bgLayout: "#f2fcfe" },
};

/** Checked in this order, so an account holding several roles gets the first match. */
const THEME_BY_ROLE: [Role, RoleThemeId][] = [
  ["ADMIN" as Role, "aurora"],
  ["STAFF" as Role, "ocean"],
  ["ACCOUNT_HOLDER" as Role, "ember"],
  ["STOCK_OWNER" as Role, "orchid"],
  ["THREE_PL" as Role, "lagoon"],
];

export function themeIdForRoles(roles: Role[] | undefined): RoleThemeId {
  return THEME_BY_ROLE.find(([role]) => roles?.includes(role))?.[1] ?? "aurora";
}

/**
 * Inline script for <head> that sets data-role-theme from the stored user before first paint, so non-Admin roles
 * don't flash the Aurora background on load. Mirrors themeIdForRoles().
 */
export const ROLE_THEME_BOOT_SCRIPT = `try{var u=JSON.parse(localStorage.getItem("user")||"null"),r=(u&&u.roles)||[],m=${JSON.stringify(
  THEME_BY_ROLE,
)};for(var i=0;i<m.length;i++){if(r.indexOf(m[i][0])>-1){document.documentElement.dataset.roleTheme=m[i][1];break}}}catch(e){}`;
