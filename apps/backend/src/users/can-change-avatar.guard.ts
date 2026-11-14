import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { JwtPayload } from "../auth/jwt.strategy";
import { resolveCompanyId } from "../common/company-scope.util";
import { UsersService } from "./users.service";

/**
 * Runs `UsersService.assertCanChange` for `POST /users/:id/avatar` before the upload interceptor, so a refused
 * request never stores the file. Method-level, so the class guards (JWT, roles, permissions) have already run.
 */
@Injectable()
export class CanChangeAvatarGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    await this.usersService.assertCanChange(resolveCompanyId(req.user, companyId), req.user, req.params.id, "edit");
    return true;
  }
}
