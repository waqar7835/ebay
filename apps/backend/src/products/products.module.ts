import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Product } from "../database/models/product.model";
import { OrderItem } from "../database/models/order-item.model";
import { ProductStock } from "../database/models/product-stock.model";
import { User } from "../database/models/user.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [SequelizeModule.forFeature([Product, ProductStock, OrderItem, User, StaffProfile, BackofficeStaffProfile])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
