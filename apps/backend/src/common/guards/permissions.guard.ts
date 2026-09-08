import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectModel } from "@nestjs/sequelize";
import { Role } from "@ebay-order-management/shared";
import { StaffProfile } from "../../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../../database/models/backoffice-staff-profile.model";
import { PERMISSION_KEY, StaffPermissionKey } from "../decorators/permission.decorator";
import type { JwtPayload } from "../../auth/jwt.strategy";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
    @InjectModel(BackofficeStaffProfile) private readonly backofficeStaffProfileModel: typeof BackofficeStaffProfile,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<StaffPermissionKey>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permission) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user) {
      return false;
    }

    if (user.roles.includes(Role.SUPER_ADMIN)) {
      return true;
    }

    if (user.realm === "backoffice") {
      if (!user.roles.includes(Role.PLATFORM_STAFF)) {
        throw new ForbiddenException("You do not have permission to perform this action");
      }
      const profile = await this.backofficeStaffProfileModel.findByPk(user.sub);
      if (profile && profile[permission]) {
        return true;
      }
      throw new ForbiddenException("You do not have permission to perform this action");
    }

    if (user.roles.includes(Role.ADMIN)) {
      return true;
    }
    if (!user.roles.includes(Role.STAFF)) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }

    const profile = await this.staffProfileModel.findByPk(user.sub);
    if (profile && profile[permission]) {
      return true;
    }

    throw new ForbiddenException("You do not have permission to perform this action");
  }
}
