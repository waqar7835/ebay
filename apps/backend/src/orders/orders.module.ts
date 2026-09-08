import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Order } from "../database/models/order.model";
import { Product } from "../database/models/product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { BillingModule } from "../billing/billing.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Order,
      Product,
      AccountHolderProfile,
      StockOwnerProfile,
      ThreePlProfile,
      StaffProfile,
      BackofficeStaffProfile,
    ]),
    BillingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
