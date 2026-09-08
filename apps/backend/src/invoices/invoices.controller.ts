import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { InvoicesService } from "./invoices.service";
import { GenerateInvoiceDto } from "./dto/generate-invoice.dto";

@ApiTags("invoices")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string, @Query("userId") userId?: string) {
    return this.invoicesService.list(resolveCompanyId(user, companyId), userId);
  }

  @Post("generate")
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateInvoiceDto, @Query("companyId") companyId?: string) {
    return this.invoicesService.generate(resolveCompanyId(user, companyId), user, dto);
  }

  @Patch(":id/mark-paid")
  @RequirePermission("canGenerateInvoices")
  markPaid(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.invoicesService.markPaid(resolveCompanyId(user, companyId), id);
  }
}
