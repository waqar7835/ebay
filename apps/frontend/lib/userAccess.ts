import type { Role } from "@ebay-order-management/shared";
import type { StoredUser } from "./api";

/**
 * Mirrors the backend's UsersService.assertCanChange (decided 2026-11-13), so the Users pages only offer what will work.
 * A partner with Admin access logs in with ADMIN in its roles; the real company Admin has no STAFF role.
 */
export function isRealAdmin(me: StoredUser | null): boolean {
  return !!me && me.roles.includes("ADMIN" as Role) && !me.roles.includes("STAFF" as Role);
}

/** The Admin or a partner with Admin access: Staff permissions, subscription, and everything else the Admin does. */
export function actsAsAdmin(me: StoredUser | null): boolean {
  return !!me && me.roles.includes("ADMIN" as Role);
}

interface Target {
  id: string;
  roles: Role[];
  staffProfile?: { isPartner: boolean } | null;
}

/**
 * Why `me` can't change this account on the Users pages, or null when it can. The Admin's account: only the Admin
 * itself (edit only). A partner's account: only the real Admin. Your own account: use the Profile page.
 */
export function changeBlockedReason(me: StoredUser | null, target: Target): string | null {
  if (!me) return "Loading…";
  if (target.roles.includes("ADMIN" as Role)) {
    return isRealAdmin(me) && me.id === target.id ? null : "Only the company Admin can change the Admin's account.";
  }
  if (me.id === target.id) return "You can't change your own account here — use your Profile page.";
  if (target.staffProfile?.isPartner && !isRealAdmin(me)) return "Only the company Admin can change a partner's account.";
  return null;
}
