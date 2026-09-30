import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { Company } from "../database/models/company.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { FinanceModule } from "../finance/finance.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { User } from "../database/models/user.model";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Order,
      OrderItem,
      Company,
      Product,
      AccountHolderProfile,
      StockOwnerProfile,
      ThreePlProfile,
      StaffProfile,
      BackofficeStaffProfile,
      User,
    ]),
    SubscriptionsModule,
    FinanceModule,
    ExchangeRatesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
