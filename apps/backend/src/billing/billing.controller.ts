import {
  Body,
  Controller,
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
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { multerDiskOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { BillingService } from "./billing.service";
import { SubmitSeatOrderDto } from "./dto/submit-seat-order.dto";

@ApiTags("billing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("preview")
  @RequirePermission("canManageUsers")
  preview(
    @CurrentUser() user: JwtPayload,
    @Query("userId") userId: string,
    @Query("months") months: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.billingService.previewCharge(resolveCompanyId(user, companyId), userId, Number(months));
  }

  @Post("seat-orders")
  @RequirePermission("canManageUsers")
  @UseInterceptors(FileInterceptor("receipt", multerDiskOptions("receipts")))
  submitOrder(
    @CurrentUser() user: JwtPayload,
    @Body() body: SubmitSeatOrderDto & { items: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("companyId") companyId?: string,
  ) {
    const items = typeof body.items === "string" ? JSON.parse(body.items) : body.items;
    return this.billingService.submitOrder({
      companyId: resolveCompanyId(user, companyId),
      submittedByUserId: user.sub,
      items,
      receiptFileUrl: file ? publicUploadUrl("receipts", file.filename) : null,
      referenceNote: body.referenceNote ?? null,
    });
  }

  @Get("seat-orders")
  @RequirePermission("canManageUsers")
  listOrders(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.billingService.listCompanyOrders(resolveCompanyId(user, companyId));
  }

  @Get("seat-orders/pending")
  @Roles(Role.SUPER_ADMIN)
  listPending() {
    return this.billingService.listPendingOrders();
  }

  @Patch("seat-orders/:id/review")
  @Roles(Role.SUPER_ADMIN)
  review(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body("approve") approve: boolean) {
    return this.billingService.reviewOrder(id, user.sub, approve);
  }
}
