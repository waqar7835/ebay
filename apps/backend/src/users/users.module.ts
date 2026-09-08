import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { TokensModule } from "../tokens/tokens.module";
import { BillingModule } from "../billing/billing.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      UserRoleAssignment,
      StaffProfile,
      BackofficeStaffProfile,
      AccountHolderProfile,
      StockOwnerProfile,
      ThreePlProfile,
    ]),
    TokensModule,
    BillingModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
