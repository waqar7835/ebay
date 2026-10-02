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
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../../common/company-scope.util";
import { multerUploadOptions, publicUploadUrl } from "../../uploads/uploads.util";
import type { JwtPayload } from "../../auth/jwt.strategy";
import { InvoiceTemplatesService } from "./invoice-templates.service";
import { PreviewInvoiceTemplateDto, SaveInvoiceTemplateDto, SetDefaultInvoiceTemplateDto } from "./invoice-template.dto";

const LOGO_MAX_SIZE = 2 * 1024 * 1024;
// pdfkit can only draw PNG and JPEG; PNG keeps a logo's transparent background.
const logoFilter = (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
  if (["image/png", "image/jpeg"].includes(file.mimetype)) cb(null, true);
  else cb(new BadRequestException("Template logos must be PNG or JPEG images"), false);
};

/**
 * Invoice templates. Managing them (create/edit/reset/delete/logo/default/preview) is the company Admin's —
 * checked in the service, since RolesGuard lets SUPER_ADMIN through and the backoffice only looks.
 */
@ApiTags("invoice-templates")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("invoice-templates")
export class InvoiceTemplatesController {
  constructor(private readonly templatesService: InvoiceTemplatesService) {}

  /** Predefined + the company's custom templates, and which one is the default. */
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.templatesService.list(resolveCompanyId(user, companyId), user);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: SaveInvoiceTemplateDto) {
    return this.templatesService.create(resolveCompanyId(user), user, dto);
  }

  @Post("default")
  setDefault(@CurrentUser() user: JwtPayload, @Body() dto: SetDefaultInvoiceTemplateDto) {
    return this.templatesService.setDefault(resolveCompanyId(user), user, dto.templateId);
  }

  /** Sample invoice drawn with unsaved settings; an unsaved logo comes along as the `logo` file. */
  @Post("preview")
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: LOGO_MAX_SIZE }, fileFilter: logoFilter }))
  async preview(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PreviewInvoiceTemplateDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const pdf = await this.templatesService.preview(resolveCompanyId(user), user, dto, file);
    return new StreamableFile(pdf, { type: "application/pdf", disposition: 'inline; filename="template-preview.pdf"' });
  }

  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SaveInvoiceTemplateDto) {
    return this.templatesService.update(resolveCompanyId(user), user, id, dto);
  }

  /** A predefined template back to its original colors, no own logo and no watermark. */
  @Post(":id/reset")
  reset(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.templatesService.reset(resolveCompanyId(user), user, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.templatesService.remove(resolveCompanyId(user), user, id);
  }

  @Post(":id/logo")
  @UseInterceptors(FileInterceptor("logo", multerUploadOptions("logos", { maxFileSize: LOGO_MAX_SIZE, fileFilter: logoFilter })))
  uploadLogo(@CurrentUser() user: JwtPayload, @Param("id") id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Choose an image");
    return this.templatesService.setLogo(resolveCompanyId(user), user, id, publicUploadUrl("logos", file.filename));
  }

  /** Back to the company logo. */
  @Delete(":id/logo")
  removeLogo(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.templatesService.setLogo(resolveCompanyId(user), user, id, null);
  }
}
