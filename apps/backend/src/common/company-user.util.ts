import { Role } from "@ebay-order-management/shared";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";

/**
 * Whether `userId` is an account of `companyId` holding `role` (security audit 2026-11-13: orders and products may only
 * point at the company's own Account Holders / Stock Owners / 3PLs).
 */
export async function isCompanyUserWithRole(userModel: typeof User, companyId: string, userId: string, role: Role): Promise<boolean> {
  const user = await userModel.findOne({
    where: { id: userId, companyId },
    attributes: ["id"],
    include: [{ model: UserRoleAssignment, where: { role }, attributes: [] }],
  });
  return !!user;
}
