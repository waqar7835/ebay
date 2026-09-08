import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { multerDiskOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CompaniesService } from "./companies.service";

@ApiTags("companies")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get("me")
  getMine(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.companiesService.get(resolveCompanyId(user, companyId));
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.PLATFORM_STAFF)
  listAll() {
    return this.companiesService.list();
  }

  @Post("me/logo")
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor("logo", multerDiskOptions("logos")))
  uploadLogo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query("companyId") companyId?: string,
  ) {
    return this.companiesService.updateLogo(resolveCompanyId(user, companyId), publicUploadUrl("logos", file.filename));
  }

  @Post("me/name")
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateName(@CurrentUser() user: JwtPayload, @Body("name") name: string, @Query("companyId") companyId?: string) {
    return this.companiesService.updateName(resolveCompanyId(user, companyId), name);
  }
}
