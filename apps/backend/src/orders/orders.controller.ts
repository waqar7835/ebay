import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { resolveCompanyId } from "../common/company-scope.util";
import type { JwtPayload } from "../auth/jwt.strategy";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-status.dto";

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("companyId") companyId?: string) {
    return this.ordersService.list(resolveCompanyId(user, companyId), user);
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

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Query("companyId") companyId?: string,
  ) {
    return this.ordersService.updateStatus(resolveCompanyId(user, companyId), user, id, dto);
  }
}
