import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { SubscriptionPlan } from "../database/models/subscription-plan.model";
import { SubscriptionBillingPeriod } from "../database/models/subscription-billing-period.model";
import { SubscriptionPayment } from "../database/models/subscription-payment.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsScheduler } from "./subscriptions.scheduler";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      SubscriptionPlan,
      SubscriptionBillingPeriod,
      SubscriptionPayment,
      User,
      UserRoleAssignment,
      StaffProfile,
      BackofficeStaffProfile,
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsScheduler],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
