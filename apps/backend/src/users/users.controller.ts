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
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { multerUploadOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { UsersService } from "./users.service";
import {
  AccountHolderProfileInput,
  InviteUserDto,
  StaffPermissionsInput,
  StockOwnerProfileInput,
  ThreePlProfileInput,
} from "./dto/invite-user.dto";
import { ChangePasswordDto, UpdateOwnProfileDto, UpdateUserDto } from "./dto/update-own-profile.dto";

/** Pictures only (no SVG), max 2 MB — the portal crops and resizes to a small JPEG before uploading. */
const AVATAR_UPLOAD = multerUploadOptions("avatars", {
  maxFileSize: 2 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException("Profile pictures must be JPEG, PNG or WebP images"), false);
  },
});

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
  @UseInterceptors(FileInterceptor("avatar", AVATAR_UPLOAD))
  uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("companyId") companyId?: string,
  ) {
    if (!file) throw new BadRequestException("Choose an image");
    return this.usersService.setAvatar(resolveCompanyId(user, companyId), id, publicUploadUrl("avatars", file.filename));
  }

  @Patch("me/password")
  changeOwnPassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.sub, dto);
  }

  @Get(":id")
  @RequirePermission("canManageUsers")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.get(resolveCompanyId(user, companyId), id);
  }

  @Patch(":id")
  @RequirePermission("canManageUsers")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.usersService.updateUser(resolveCompanyId(user, companyId), id, dto);
  }

  @Post("invite")
  @RequirePermission("canManageUsers")
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteUserDto, @Query("companyId") companyId?: string) {
    return this.usersService.invite(resolveCompanyId(user, companyId), user.sub, dto);
  }

  @Patch(":id/disable")
  @RequirePermission("canManageUsers")
  disable(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.setEnabled(resolveCompanyId(user, companyId), id, false);
  }

  @Delete(":id")
  @RequirePermission("canManageUsers")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.remove(resolveCompanyId(user, companyId), id, user.sub);
  }

  @Patch(":id/enable")
  @RequirePermission("canManageUsers")
  enable(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.setEnabled(resolveCompanyId(user, companyId), id, true);
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
