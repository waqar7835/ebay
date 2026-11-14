import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Role } from "@ebay-order-management/shared";
import { StaffProfile } from "../database/models/staff-profile.model";
import type { JwtPayload } from "../auth/jwt.strategy";

export interface ProfitAccess {
  userId: string;
  /** The company Admin, or a partner with Admin access: categories and every expense. */
  admin: boolean;
  /** The real company Admin only: the split settings (Admin % and partners' %). */
  realAdmin: boolean;
  /** A partner (Staff account marked partner). */
  partner: boolean;
  /** Can generate / delete profit statements: the Admin, or a partner given the permission. */
  canManageStatements: boolean;
}

/**
 * Profit & expenses is the company's internal split (2026-11-05): only the company Admin and partners see it, in the
 * portal only — the backoffice has no access.
 */
@Injectable()
export class ProfitAccessService {
  constructor(@InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile) {}

  async resolve(requester: JwtPayload): Promise<ProfitAccess> {
    if (requester.realm !== "portal") throw new ForbiddenException("Profit & expenses are only available in the company portal");
    if (requester.roles.includes(Role.ADMIN) && !requester.coAdmin) {
      return { userId: requester.sub, admin: true, realAdmin: true, partner: false, canManageStatements: true };
    }
    const profile = requester.roles.includes(Role.STAFF) ? await this.staffProfileModel.findByPk(requester.sub) : null;
    if (!profile?.isPartner) throw new ForbiddenException("Only the company Admin and partners can see profit & expenses");
    // A partner with Admin access manages like the Admin, but the split itself stays the real Admin's.
    const coAdmin = !!profile.hasAdminAccess;
    return {
      userId: requester.sub,
      admin: coAdmin,
      realAdmin: false,
      partner: true,
      canManageStatements: coAdmin || profile.canManageProfitStatements,
    };
  }

  /** The split settings (Admin % and partners' %): the real company Admin only. */
  async assertRealAdmin(requester: JwtPayload): Promise<ProfitAccess> {
    const access = await this.resolve(requester);
    if (!access.realAdmin) throw new ForbiddenException("Only the company Admin can change the profit split");
    return access;
  }

  async assertAdmin(requester: JwtPayload): Promise<ProfitAccess> {
    const access = await this.resolve(requester);
    if (!access.admin) throw new ForbiddenException("Only the company Admin can change this");
    return access;
  }
}
