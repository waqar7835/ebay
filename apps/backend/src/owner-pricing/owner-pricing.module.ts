import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { AccountHolderOwnedProduct } from "../database/models/account-holder-owned-product.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { Product } from "../database/models/product.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { OwnerPricingService } from "./owner-pricing.service";

@Module({
  imports: [SequelizeModule.forFeature([AccountHolderOwnedProduct, AccountHolderProfile, Product, User, UserRoleAssignment])],
  providers: [OwnerPricingService],
  exports: [OwnerPricingService],
})
export class OwnerPricingModule {}
