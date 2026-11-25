import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { canSetOrderPrices } from "../common/admin-access.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { AdvancesService } from "./advances.service";
import { AdvanceDto } from "./dto/advance.dto";

/**
 * Account Holder advances (2026-11-25). Managed by the company Admin and partners (portal); an Account Holder reads
 * its own balance and history.
 */
@ApiTags("account-holder-advances")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("account-holder-advances")
export class AdvancesController {
  constructor(private readonly advances: AdvancesService) {}

  @Get("me")
  mine(@CurrentUser() user: JwtPayload) {
    if (user.realm !== "portal" || !user.roles.includes(Role.ACCOUNT_HOLDER)) {
      throw new ForbiddenException("Only Account Holders have an advance");
    }
    return this.advances.summary(resolveCompanyId(user), user.sub);
  }

  @Get(":userId")
  list(@CurrentUser() user: JwtPayload, @Param("userId", ParseUUIDPipe) userId: string) {
    assertCanManage(user);
    return this.advances.summary(resolveCompanyId(user), userId);
  }

  @Post(":userId")
  create(@CurrentUser() user: JwtPayload, @Param("userId", ParseUUIDPipe) userId: string, @Body() dto: AdvanceDto) {
    assertCanManage(user);
    return this.advances.create(resolveCompanyId(user), userId, dto, user.sub);
  }

  @Patch(":userId/:advanceId")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("advanceId", ParseUUIDPipe) advanceId: string,
    @Body() dto: AdvanceDto,
  ) {
    assertCanManage(user);
    return this.advances.update(resolveCompanyId(user), userId, advanceId, dto);
  }

  @Delete(":userId/:advanceId")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("advanceId", ParseUUIDPipe) advanceId: string,
  ) {
    assertCanManage(user);
    return this.advances.remove(resolveCompanyId(user), userId, advanceId);
  }
}

/** The company Admin and partners (like order prices); never the backoffice. */
function assertCanManage(user: JwtPayload) {
  if (!canSetOrderPrices(user)) throw new ForbiddenException("Only the company Admin and partners manage advances");
}
