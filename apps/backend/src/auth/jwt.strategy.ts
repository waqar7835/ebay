import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Role, UserStatus } from "@ebay-order-management/shared";
import { jwtSecret } from "../common/jwt-secret.util";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { BackofficeUser } from "../database/models/backoffice-user.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { effectiveRoles, isCoAdmin } from "../common/admin-access.util";
import type { StaffPermissionKey } from "../common/decorators/permission.decorator";

export interface JwtPayload {
  sub: string;
  companyId: string | null;
  email: string;
  roles: Role[];
  /** Which identity table `sub` refers to — determines how guards resolve permissions/company scope. */
  realm: "backoffice" | "portal";
  /** The account's session version when the token was signed (missing on tokens from before it = 0). */
  sv?: number;
  /** A partner with Admin access: `roles` then includes ADMIN (see common/admin-access.util.ts). */
  coAdmin?: boolean;
  /** Portal Staff: the permission flags, loaded once per request by JwtStrategy (null = no staff profile). */
  staffPermissions?: Record<StaffPermissionKey, boolean> | null;
  /** Set by jsonwebtoken when signing. */
  iat?: number;
  exp?: number;
}

const STAFF_PERMISSION_FLAGS: StaffPermissionKey[] = [
  "canManageOrders",
  "canManageStock",
  "canManageUsers",
  "canGenerateInvoices",
  "canViewFinancials",
];

/**
 * Checks every request's token against the account as it is now (security audit 2026-11-13): it must still exist, be
 * ACTIVE and have the same session version (bumped on password reset/change and disable), and its roles are re-read
 * from the database instead of trusted from the token. Any failure ends the session (401 SESSION_EXPIRED); a database
 * error answers 503 instead, so a hiccup doesn't log users out.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(BackofficeUser) private readonly backofficeUserModel: typeof BackofficeUser,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    try {
      return await this.check(payload);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // A database failure isn't a dead session: answer 503 so the apps keep the user logged in (JwtAuthGuard).
      this.logger.error(`Token check failed: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException("The server is temporarily unavailable. Please try again.");
    }
  }

  private async check(payload: JwtPayload): Promise<JwtPayload> {
    const sv = payload.sv ?? 0;
    if (payload.realm === "backoffice") {
      const user = await this.backofficeUserModel.findByPk(payload.sub, { attributes: ["id", "status", "role", "sessionVersion"] });
      if (!user || user.status !== UserStatus.ACTIVE || user.sessionVersion !== sv) throw new UnauthorizedException();
      return { ...payload, companyId: null, roles: [user.role] };
    }
    if (payload.realm !== "portal") throw new UnauthorizedException();
    const user = await this.userModel.findByPk(payload.sub, {
      attributes: ["id", "companyId", "status", "sessionVersion"],
      include: [
        { model: UserRoleAssignment, attributes: ["role"] },
        {
          model: StaffProfile,
          attributes: ["userId", "isPartner", "hasAdminAccess", ...STAFF_PERMISSION_FLAGS],
        },
      ],
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.sessionVersion !== sv || user.companyId !== payload.companyId) {
      throw new UnauthorizedException();
    }
    const roles = user.roleAssignments.map((r) => r.role);
    const staff = user.staffProfile;
    return {
      ...payload,
      roles: effectiveRoles(roles, staff),
      coAdmin: isCoAdmin(staff),
      staffPermissions: staff
        ? (Object.fromEntries(STAFF_PERMISSION_FLAGS.map((k) => [k, !!staff[k]])) as Record<StaffPermissionKey, boolean>)
        : null,
    };
  }
}
