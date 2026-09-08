import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@ebay-order-management/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { JwtPayload } from "../../auth/jwt.strategy";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user) {
      return false;
    }
    if (user.roles.includes(Role.SUPER_ADMIN)) {
      return true;
    }
    if (required.some((role) => user.roles.includes(role))) {
      return true;
    }

    throw new ForbiddenException("You do not have permission to perform this action");
  }
}
