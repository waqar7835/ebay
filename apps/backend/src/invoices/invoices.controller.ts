import { Body, Controller, Delete, Get, Param, Patch, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { InvoiceRole } from "@ebay-order-management/shared";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { InvoicesService } from "./invoices.service";
import { InvoiceDraftDto } from "./dto/invoice-draft.dto";

@ApiTags("invoices")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /** Managers get every company invoice (optionally for one user); everyone else only their own. */
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string, @Query("userId") userId?: string) {
    return this.invoicesService.list(resolveCompanyId(user, companyId), user, userId);
  }

  /** Open SHIPPED/DELIVERED orders (and pending refund adjustments) the wizard can put on an invoice. */
  @Get("invoiceable-orders")
  @RequirePermission("canGenerateInvoices")
  invoiceable(
    @CurrentUser() user: JwtPayload,
    @Query("userId") userId: string,
    @Query("role") role: InvoiceRole,
    @Query("invoiceId") invoiceId?: string,
  ) {
    return this.invoicesService.invoiceable(resolveCompanyId(user), user, userId, role, invoiceId);
  }

  /** The wizard's Review step: renders the selection as a DRAFT PDF without saving anything. */
  @Post("preview")
  @RequirePermission("canGenerateInvoices")
  async preview(@CurrentUser() user: JwtPayload, @Body() dto: InvoiceDraftDto, @Query("invoiceId") invoiceId?: string) {
    const pdf = await this.invoicesService.preview(resolveCompanyId(user), user, dto, invoiceId);
    return new StreamableFile(pdf, { type: "application/pdf", disposition: 'inline; filename="invoice-draft.pdf"' });
  }

  @Post()
  @RequirePermission("canGenerateInvoices")
  create(@CurrentUser() user: JwtPayload, @Body() dto: InvoiceDraftDto) {
    return this.invoicesService.create(resolveCompanyId(user), user, dto);
  }

  @Get(":id")
  @RequirePermission("canGenerateInvoices")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.invoicesService.get(resolveCompanyId(user), user, id);
  }

  /** Re-issues an UNPAID invoice from a new selection (same user and role, same number). */
  @Patch(":id")
  @RequirePermission("canGenerateInvoices")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: InvoiceDraftDto) {
    return this.invoicesService.update(resolveCompanyId(user), user, id, dto);
  }

  @Get(":id/pdf")
  async pdf(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    const { buffer, filename } = await this.invoicesService.pdf(resolveCompanyId(user, companyId), user, id);
    return new StreamableFile(buffer, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  /** UNPAID → deleted, PAID → VOID; either way the orders reopen. */
  @Delete(":id")
  @RequirePermission("canGenerateInvoices")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.invoicesService.remove(resolveCompanyId(user), user, id);
  }

  @Patch(":id/mark-paid")
  @RequirePermission("canGenerateInvoices")
  markPaid(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.invoicesService.markPaid(resolveCompanyId(user), user, id);
  }
}
