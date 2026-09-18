import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { SeatBilling } from "../database/models/seat-billing.model";
import { User } from "../database/models/user.model";
import { FinanceModule } from "../finance/finance.module";
import { BillingModule } from "../billing/billing.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      Order,
      Product,
      AccountHolderProfile,
      StockOwnerProfile,
      ThreePlProfile,
      StaffProfile,
      SeatBilling,
      User,
    ]),
    FinanceModule,
    BillingModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
