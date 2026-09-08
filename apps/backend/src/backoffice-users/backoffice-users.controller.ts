import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role, UserStatus } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { BackofficeUsersService } from "./backoffice-users.service";
import { BackofficePermissionsInput, InviteBackofficeUserDto } from "./dto/invite-backoffice-user.dto";

/** Platform Staff accounts can only be created/managed by a Super Admin. */
@ApiTags("backoffice-users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller("backoffice-users")
export class BackofficeUsersController {
  constructor(private readonly backofficeUsersService: BackofficeUsersService) {}

  @Get()
  list() {
    return this.backofficeUsersService.list();
  }

  @Post("invite")
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteBackofficeUserDto) {
    return this.backofficeUsersService.invite(user.sub, dto);
  }

  @Patch(":id/disable")
  disable(@Param("id") id: string) {
    return this.backofficeUsersService.setStatus(id, UserStatus.DISABLED);
  }

  @Patch(":id/enable")
  enable(@Param("id") id: string) {
    return this.backofficeUsersService.setStatus(id, UserStatus.ACTIVE);
  }

  @Patch(":id/permissions")
  updatePermissions(@Param("id") id: string, @Body() dto: BackofficePermissionsInput) {
    return this.backofficeUsersService.upsertPermissions(id, dto);
  }
}
