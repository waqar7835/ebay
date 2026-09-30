import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermission } from "../common/decorators/permission.decorator";
import { ExchangeRatesService } from "./exchange-rates.service";

@ApiTags("exchange-rates")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller("exchange-rates")
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  /** Current PKR rate per currency, for the order form (flags when the API is down / a rate must be entered). */
  @Get()
  @RequirePermission("canManageOrders")
  latest() {
    return this.exchangeRatesService.latest();
  }
}
