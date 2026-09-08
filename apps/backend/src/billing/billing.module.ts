import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { PlatformSetting } from "../database/models/platform-setting.model";
import { SeatBilling } from "../database/models/seat-billing.model";
import { SeatPaymentOrder } from "../database/models/seat-payment-order.model";
import { SeatPaymentOrderItem } from "../database/models/seat-payment-order-item.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { BillingScheduler } from "./billing.scheduler";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      PlatformSetting,
      SeatBilling,
      SeatPaymentOrder,
      SeatPaymentOrderItem,
      User,
      UserRoleAssignment,
      StaffProfile,
      BackofficeStaffProfile,
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingScheduler],
  exports: [BillingService],
})
export class BillingModule {}
