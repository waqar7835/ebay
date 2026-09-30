import { Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role, type OrderStatus } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { JwtPayload } from "../auth/jwt.strategy";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get("account-status")
  async accountStatus(@CurrentUser() user: JwtPayload) {
    return { disabled: user.realm === "portal" && (await this.subscriptions.isUserDisabled(user.sub)) };
  }

  @Get("account-holder")
  @Roles(Role.ACCOUNT_HOLDER)
  async accountHolder(
    @CurrentUser() user: JwtPayload,
    @Query("companyId") companyId?: string,
    @Query("status") status?: OrderStatus,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.assertNotDisabled(user.sub);
    return this.dashboardService.accountHolder(resolveCompanyId(user, companyId), user.sub, { status, startDate, endDate });
  }

  @Get("stock-owner")
  @Roles(Role.STOCK_OWNER)
  async stockOwner(
    @CurrentUser() user: JwtPayload,
    @Query("companyId") companyId?: string,
    @Query("status") status?: OrderStatus,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.assertNotDisabled(user.sub);
    return this.dashboardService.stockOwner(resolveCompanyId(user, companyId), user.sub, { status, startDate, endDate });
  }

  @Get("three-pl")
  @Roles(Role.THREE_PL)
  async threePl(
    @CurrentUser() user: JwtPayload,
    @Query("companyId") companyId?: string,
    @Query("status") status?: OrderStatus,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    await this.assertNotDisabled(user.sub);
    return this.dashboardService.threePl(resolveCompanyId(user, companyId), user.sub, { status, startDate, endDate });
  }

  @Get("staff")
  @Roles(Role.ADMIN, Role.STAFF)
  staff(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.dashboardService.staff(resolveCompanyId(user, companyId));
  }

  private async assertNotDisabled(userId: string) {
    if (await this.subscriptions.isUserDisabled(userId)) {
      throw new ForbiddenException("Your account has been deactivated. Please contact your company admin.");
    }
  }
}
