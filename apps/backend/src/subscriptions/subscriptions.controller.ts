import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { Role, SubscriptionPaymentStatus } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { RECEIPT_TYPES, multerUploadOptions, privateUploadRef } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { SubscriptionsService } from "./subscriptions.service";
import {
  AssignPlanDto,
  BillingPeriodDto,
  CreatePlanDto,
  ReviewSubscriptionPaymentDto,
  SubmitSubscriptionPaymentDto,
  UpdateBillingPeriodDto,
  UpdatePlanDto,
} from "./dto/subscription.dto";

/**
 * Plans and billing periods are configured by the Super Admin in the backoffice. Companies
 * (the Admin or a partner with Admin access, portal only) view their subscription and submit payments;
 * only the Super Admin approves them (a financial action — Platform Staff can only view).
 */
@ApiTags("subscriptions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  // --- Plans ---

  /** Active plans; `?all=true` (backoffice only) includes inactive ones. */
  @Get("plans")
  listPlans(@CurrentUser() user: JwtPayload, @Query("all") all?: string) {
    return this.subscriptions.listPlans(all === "true" && user.realm === "backoffice");
  }

  @Post("plans")
  @Roles(Role.SUPER_ADMIN)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.subscriptions.createPlan(dto);
  }

  @Patch("plans/:id")
  @Roles(Role.SUPER_ADMIN)
  updatePlan(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptions.updatePlan(id, dto);
  }

  @Delete("plans/:id")
  @Roles(Role.SUPER_ADMIN)
  deletePlan(@Param("id") id: string) {
    return this.subscriptions.deletePlan(id);
  }

  // --- Billing periods ---

  @Get("billing-periods")
  listPeriods(@CurrentUser() user: JwtPayload, @Query("all") all?: string) {
    return this.subscriptions.listPeriods(all === "true" && user.realm === "backoffice");
  }

  @Post("billing-periods")
  @Roles(Role.SUPER_ADMIN)
  createPeriod(@Body() dto: BillingPeriodDto) {
    return this.subscriptions.createPeriod(dto);
  }

  @Patch("billing-periods/:id")
  @Roles(Role.SUPER_ADMIN)
  updatePeriod(@Param("id") id: string, @Body() dto: UpdateBillingPeriodDto) {
    return this.subscriptions.updatePeriod(id, dto);
  }

  @Delete("billing-periods/:id")
  @Roles(Role.SUPER_ADMIN)
  deletePeriod(@Param("id") id: string) {
    return this.subscriptions.deletePeriod(id);
  }

  // --- A company's subscription ---

  // The Subscription page is the Admin's (or a partner with Admin access) since 2026-11-13. Staff with canManageUsers
  // still read the plan and seat usage (the Users and Invite pages show the limits), but not the pending payment.
  // Platform Staff read it from the backoffice (with their canManageUsers flag).
  @Get("me")
  @Roles(Role.ADMIN, Role.STAFF, Role.PLATFORM_STAFF)
  @RequirePermission("canManageUsers")
  async mine(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    const subscription = await this.subscriptions.getCompanySubscription(resolveCompanyId(user, companyId));
    if (user.realm === "portal" && !user.roles.includes(Role.ADMIN)) return { ...subscription, pendingPayment: null };
    return subscription;
  }

  @Get("payments")
  @Roles(Role.ADMIN)
  listCompanyPayments(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.subscriptions.listCompanyPayments(resolveCompanyId(user, companyId));
  }

  @Post("payments")
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor("receipt", multerUploadOptions("receipts", { types: RECEIPT_TYPES, typeError: "The receipt must be a PDF, JPEG, PNG or WebP file" })))
  submitPayment(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitSubscriptionPaymentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (user.realm !== "portal") throw new ForbiddenException("Payments are submitted by the company from the portal");
    return this.subscriptions.submitPayment({
      companyId: resolveCompanyId(user),
      submittedByUserId: user.sub,
      planId: dto.planId,
      billingPeriodId: dto.billingPeriodId,
      receiptFileUrl: file ? privateUploadRef("receipts", file.filename) : null,
      referenceNote: dto.referenceNote ?? null,
    });
  }

  /** The receipt file (no longer public); access is checked in the service. */
  @Get("payments/:id/receipt")
  async receipt(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    const { buffer, contentType } = await this.subscriptions.receipt(user, id);
    return new StreamableFile(buffer, { type: contentType, disposition: "inline" });
  }

  // --- Backoffice ---

  @Get("payments/all")
  @Roles(Role.SUPER_ADMIN, Role.PLATFORM_STAFF)
  listPayments(@Query("status") status?: SubscriptionPaymentStatus) {
    return this.subscriptions.listPayments(status);
  }

  @Patch("payments/:id/review")
  @Roles(Role.SUPER_ADMIN)
  review(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ReviewSubscriptionPaymentDto) {
    return this.subscriptions.reviewPayment(id, user.sub, dto.approve);
  }

  @Post("companies/:companyId/assign")
  @Roles(Role.SUPER_ADMIN)
  assign(@Param("companyId") companyId: string, @Body() dto: AssignPlanDto) {
    return this.subscriptions.assignPlan(companyId, dto.planId, dto.endsAt);
  }
}
