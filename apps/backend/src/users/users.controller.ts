import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { parsePaging } from "../common/pagination.util";
import { IMAGE_TYPES, multerUploadOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { UsersService } from "./users.service";
import { OrdersService } from "../orders/orders.service";
import { AuthService } from "../auth/auth.service";
import { isRealAdmin } from "../common/admin-access.util";
import {
  AccountHolderProfileInput,
  InviteUserDto,
  StaffPermissionsInput,
  StockOwnerProfileInput,
  ThreePlProfileInput,
} from "./dto/invite-user.dto";
import { ChangePasswordDto, UpdateOwnProfileDto, UpdateUserDto } from "./dto/update-own-profile.dto";
import { CanChangeAvatarGuard } from "./can-change-avatar.guard";

/** Pictures only (no SVG), max 2 MB — the portal crops and resizes to a small JPEG before uploading. */
const AVATAR_UPLOAD = multerUploadOptions("avatars", {
  maxFileSize: 2 * 1024 * 1024,
  types: IMAGE_TYPES,
  typeError: "Profile pictures must be JPEG, PNG or WebP images",
});

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @RequirePermission("canManageUsers")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("companyId") companyId?: string,
    // Sending either returns { data, total, page, pageSize, subscriptionDisabled } instead of the whole list.
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.usersService.list(resolveCompanyId(user, companyId), parsePaging(page, pageSize));
  }

  @Get("me")
  getOwn(@CurrentUser() user: JwtPayload) {
    return this.usersService.get(resolveCompanyId(user), user.sub);
  }

  @Patch("me")
  updateOwn(@CurrentUser() user: JwtPayload, @Body() dto: UpdateOwnProfileDto) {
    return this.usersService.updateOwnProfile(user.sub, dto);
  }

  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("avatar", AVATAR_UPLOAD))
  uploadOwnAvatar(@CurrentUser() user: JwtPayload, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Choose an image");
    return this.usersService.setAvatar(resolveCompanyId(user), user.sub, publicUploadUrl("avatars", file.filename));
  }

  /** Company admins (and Staff with canManageUsers) can set another user's picture. */
  @Post(":id/avatar")
  @RequirePermission("canManageUsers")
  @UseGuards(CanChangeAvatarGuard) // before the interceptor, so a refused upload is never stored
  @UseInterceptors(FileInterceptor("avatar", AVATAR_UPLOAD))
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("companyId") companyId?: string,
  ) {
    if (!file) throw new BadRequestException("Choose an image");
    return this.usersService.setAvatar(resolveCompanyId(user, companyId), id, publicUploadUrl("avatars", file.filename));
  }

  @Patch("me/password")
  async changeOwnPassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    const { message, sessionVersion } = await this.usersService.changePassword(user.sub, dto);
    // Other sessions are logged out; this one carries on with a new token.
    return { message, accessToken: await this.authService.reissueToken(user, sessionVersion) };
  }

  @Get(":id")
  @RequirePermission("canManageUsers")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.get(resolveCompanyId(user, companyId), id);
  }

  @Patch(":id")
  @RequirePermission("canManageUsers")
  async update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @Query("companyId") companyId?: string,
  ) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "edit");
    return this.usersService.updateUser(resolveCompanyId(user, companyId), id, dto);
  }

  /** Open orders still in this user's old currency (after a currency change). */
  @Get(":id/orders-off-currency")
  @RequirePermission("canManageUsers")
  ordersOffCurrency(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.ordersService.listOrdersOffCurrency(resolveCompanyId(user, companyId), id);
  }

  /** Re-reads those orders' amounts in the user's current currency. */
  @Post(":id/recompute-orders-currency")
  @RequirePermission("canManageUsers")
  async recomputeOrdersCurrency(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "edit");
    return this.ordersService.recomputeOrdersCurrency(resolveCompanyId(user, companyId), id);
  }

  @Post("invite")
  @RequirePermission("canManageUsers")
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteUserDto, @Query("companyId") companyId?: string) {
    return this.usersService.invite(resolveCompanyId(user, companyId), user, dto, canSetPartner(user));
  }

  @Patch(":id/disable")
  @RequirePermission("canManageUsers")
  async disable(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "status");
    return this.usersService.setEnabled(resolveCompanyId(user, companyId), id, false);
  }

  @Delete(":id")
  @RequirePermission("canManageUsers")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "delete");
    return this.usersService.remove(resolveCompanyId(user, companyId), id, user.sub);
  }

  @Patch(":id/enable")
  @RequirePermission("canManageUsers")
  async enable(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "status");
    return this.usersService.setEnabled(resolveCompanyId(user, companyId), id, true);
  }

  @Patch(":id/staff-permissions")
  @RequirePermission("canManageUsers")
  async updateStaffPermissions(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: StaffPermissionsInput,
    @Query("companyId") companyId?: string,
  ) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "permissions");
    return this.usersService.upsertStaffProfile(resolveCompanyId(user, companyId), id, dto, canSetPartner(user));
  }

  @Patch(":id/account-holder-profile")
  @RequirePermission("canManageUsers")
  async updateAccountHolderProfile(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: AccountHolderProfileInput,
    @Query("companyId") companyId?: string,
  ) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "edit");
    return this.usersService.upsertAccountHolderProfile(resolveCompanyId(user, companyId), id, dto);
  }

  @Patch(":id/stock-owner-profile")
  @RequirePermission("canManageUsers")
  async updateStockOwnerProfile(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: StockOwnerProfileInput,
    @Query("companyId") companyId?: string,
  ) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "edit");
    return this.usersService.upsertStockOwnerProfile(resolveCompanyId(user, companyId), id, dto);
  }

  @Patch(":id/three-pl-profile")
  @RequirePermission("canManageUsers")
  async updateThreePlProfile(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ThreePlProfileInput,
    @Query("companyId") companyId?: string,
  ) {
    await this.usersService.assertCanChange(resolveCompanyId(user, companyId), user, id, "edit");
    return this.usersService.upsertThreePlProfile(resolveCompanyId(user, companyId), id, dto);
  }
}

/**
 * Only the real company Admin marks partners and sets their %, statement permission and Admin access — not a partner
 * with Admin access (decided 2026-11-13).
 */
function canSetPartner(user: JwtPayload): boolean {
  return isRealAdmin(user);
}
