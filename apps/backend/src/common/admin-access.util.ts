import { Role } from "@ebay-order-management/shared";
import type { JwtPayload } from "../auth/jwt.strategy";

/**
 * A partner with Admin access (2026-11-13) gets the ADMIN role on every request (JwtStrategy / login), so every Admin
 * check covers it. A few things stay with the real company Admin only: partner settings (%, permissions, Admin access),
 * the profit split, and the Admin's own account — checked with this.
 */
export function isRealAdmin(user: JwtPayload): boolean {
  return user.realm === "portal" && user.roles.includes(Role.ADMIN) && !user.coAdmin;
}

/** The roles a portal account acts with: its own, plus ADMIN for a partner with Admin access. */
export function effectiveRoles(roles: Role[], staff: { isPartner: boolean; hasAdminAccess: boolean } | null | undefined): Role[] {
  return isCoAdmin(staff) && !roles.includes(Role.ADMIN) ? [...roles, Role.ADMIN] : roles;
}

export function isCoAdmin(staff: { isPartner: boolean; hasAdminAccess: boolean } | null | undefined): boolean {
  return !!staff?.isPartner && !!staff.hasAdminAccess;
}
