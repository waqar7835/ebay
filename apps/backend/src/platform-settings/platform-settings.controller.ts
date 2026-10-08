import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { MailerService } from "../mailer/mailer.service";
import { multerUploadOptions, publicUploadUrl } from "../uploads/uploads.util";
import { TestEmailDto, UpdatePlatformSettingsDto } from "./platform-settings.dto";
import { PlatformSettingsService } from "./platform-settings.service";

/** PNG keeps transparency for the site logo; no SVG (it could carry scripts). */
const LOGO_UPLOAD = multerUploadOptions("branding", {
  maxFileSize: 2 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException("The logo must be a PNG, JPEG or WebP image"), false);
  },
});

/** Same formats as the logo plus ICO; small, since browsers show it at 16–48px. */
const FAVICON_TYPES = ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];
const FAVICON_UPLOAD = multerUploadOptions("branding", {
  maxFileSize: 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    if (FAVICON_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException("The favicon must be a PNG, ICO, JPEG or WebP image"), false);
  },
});

/** Super Admin only (backoffice realm): branding, public contact details, contact-form destination and SMTP. */
@ApiTags("platform-settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller("platform-settings")
export class PlatformSettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly mailer: MailerService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdatePlatformSettingsDto) {
    return this.settings.update(dto);
  }

  @Post("logo")
  @UseInterceptors(FileInterceptor("logo", LOGO_UPLOAD))
  uploadLogo(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Choose an image");
    return this.settings.setLogo(publicUploadUrl("branding", file.filename));
  }

  @Delete("logo")
  removeLogo() {
    return this.settings.setLogo(null);
  }

  @Post("favicon")
  @UseInterceptors(FileInterceptor("favicon", FAVICON_UPLOAD))
  uploadFavicon(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Choose an image");
    return this.settings.setFavicon(publicUploadUrl("branding", file.filename));
  }

  @Delete("favicon")
  removeFavicon() {
    return this.settings.setFavicon(null);
  }

  /** Sends a real email with the saved SMTP settings and reports the SMTP error if it fails. */
  @Post("test-email")
  @HttpCode(200)
  async testEmail(@Body() dto: TestEmailDto) {
    const { brandName } = await this.settings.publicSite();
    await this.mailer.sendOrThrow(
      dto.to,
      `${brandName} test email`,
      `<p>This is a test email from ${brandName}. If you can read it, email delivery works.</p>`,
    );
    return { message: `Test email sent to ${dto.to}` };
  }
}
