import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { User } from "../database/models/user.model";
import { FinanceModule } from "../finance/finance.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      Order,
      OrderItem,
      Product,
      AccountHolderProfile,
      StockOwnerProfile,
      ThreePlProfile,
      StaffProfile,
      User,
    ]),
    FinanceModule,
    SubscriptionsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
