import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserStatus } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { UsersService } from "./users.service";
import {
  AccountHolderProfileInput,
  InviteUserDto,
  StaffPermissionsInput,
  StockOwnerProfileInput,
  ThreePlProfileInput,
} from "./dto/invite-user.dto";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission("canManageUsers")
  list(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.usersService.list(resolveCompanyId(user, companyId));
  }

  @Get(":id")
  @RequirePermission("canManageUsers")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.get(resolveCompanyId(user, companyId), id);
  }

  @Post("invite")
  @RequirePermission("canManageUsers")
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteUserDto, @Query("companyId") companyId?: string) {
    return this.usersService.invite(resolveCompanyId(user, companyId), user.sub, dto);
  }

  @Patch(":id/disable")
  @RequirePermission("canManageUsers")
  disable(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.setStatus(resolveCompanyId(user, companyId), id, UserStatus.DISABLED);
  }

  @Patch(":id/enable")
  @RequirePermission("canManageUsers")
  enable(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.setStatus(resolveCompanyId(user, companyId), id, UserStatus.ACTIVE);
  }

  @Patch(":id/staff-permissions")
  @RequirePermission("canManageUsers")
  updateStaffPermissions(@Param("id") id: string, @Body() dto: StaffPermissionsInput) {
    return this.usersService.upsertStaffProfile(id, dto);
  }

  @Patch(":id/account-holder-profile")
  @RequirePermission("canManageUsers")
  updateAccountHolderProfile(@Param("id") id: string, @Body() dto: AccountHolderProfileInput) {
    return this.usersService.upsertAccountHolderProfile(id, dto);
  }

  @Patch(":id/stock-owner-profile")
  @RequirePermission("canManageUsers")
  updateStockOwnerProfile(@Param("id") id: string, @Body() dto: StockOwnerProfileInput) {
    return this.usersService.upsertStockOwnerProfile(id, dto);
  }

  @Patch(":id/three-pl-profile")
  @RequirePermission("canManageUsers")
  updateThreePlProfile(@Param("id") id: string, @Body() dto: ThreePlProfileInput) {
    return this.usersService.upsertThreePlProfile(id, dto);
  }
}
