import {
  BadRequestException,
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
import type { OrderStatus } from "@ebay-order-management/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import { multerUploadOptions, publicUploadUrl } from "../uploads/uploads.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";
import { DropshipBuyPriceDto } from "./dto/dropship-buy-price.dto";

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query("companyId") companyId?: string,
    @Query("accountHolderId") accountHolderId?: string,
    @Query("threePlId") threePlId?: string,
    @Query("status") status?: OrderStatus,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.ordersService.list(resolveCompanyId(user, companyId), user, {
      accountHolderId,
      threePlId,
      status,
      startDate,
      endDate,
    });
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.ordersService.get(resolveCompanyId(user, companyId), id);
  }

  @Post()
  @RequirePermission("canManageOrders")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto, @Query("companyId") companyId?: string) {
    return this.ordersService.create(resolveCompanyId(user, companyId), dto);
  }

  @Patch(":id")
  @RequirePermission("canManageOrders")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.ordersService.update(resolveCompanyId(user, companyId), id, dto);
  }

  @Patch(":id/dropship-buy-price")
  setDropshipBuyPrice(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: DropshipBuyPriceDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.ordersService.setDropshipBuyPrice(resolveCompanyId(user, companyId), user, id, dto.buyPrice);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.ordersService.updateStatus(resolveCompanyId(user, companyId), user, id, dto);
  }

  @Post(":id/shipping-label")
  @RequirePermission("canManageOrders")
  @UseInterceptors(
    FileInterceptor(
      "shippingLabel",
      multerUploadOptions("shipping-labels", {
        fileFilter: (_req, file, cb) => {
          if (file.mimetype !== "application/pdf") {
            cb(new BadRequestException("Shipping label must be a PDF file"), false);
            return;
          }
          cb(null, true);
        },
      }),
    ),
  )
  uploadShippingLabel(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("companyId") companyId?: string,
  ) {
    if (!file) throw new BadRequestException("Shipping label file is required");
    return this.ordersService.uploadShippingLabel(
      resolveCompanyId(user, companyId),
      id,
      publicUploadUrl("shipping-labels", file.filename),
    );
  }
}
