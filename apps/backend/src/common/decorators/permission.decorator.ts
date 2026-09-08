import { SetMetadata } from "@nestjs/common";

export type StaffPermissionKey =
  | "canManageOrders"
  | "canManageStock"
  | "canManageUsers"
  | "canGenerateInvoices"
  | "canViewFinancials";

export const PERMISSION_KEY = "permission";
export const RequirePermission = (permission: StaffPermissionKey) => SetMetadata(PERMISSION_KEY, permission);
