import { BadRequestException } from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt.strategy";

/**
 * Resolves which company's data a request should be scoped to. Every portal-realm user
 * (ADMIN/STAFF/etc.) is pinned to their own company. A backoffice-realm user (SUPER_ADMIN or
 * PLATFORM_STAFF) has no company of their own, so they must pass ?companyId= to target one
 * when hitting a company-scoped endpoint.
 */
export function resolveCompanyId(user: JwtPayload, queryCompanyId?: string): string {
  if (user.realm === "backoffice") {
    if (!queryCompanyId) {
      throw new BadRequestException("companyId query parameter is required");
    }
    return queryCompanyId;
  }

  if (!user.companyId) {
    throw new BadRequestException("User is not associated with a company");
  }

  return user.companyId;
}
