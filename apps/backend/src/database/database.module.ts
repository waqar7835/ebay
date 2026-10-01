import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "./models/company.model";
import { User } from "./models/user.model";
import { UserRoleAssignment } from "./models/user-role.model";
import { StaffProfile } from "./models/staff-profile.model";
import { BackofficeUser } from "./models/backoffice-user.model";
import { BackofficeStaffProfile } from "./models/backoffice-staff-profile.model";
import { AccountHolderProfile } from "./models/account-holder-profile.model";
import { StockOwnerProfile } from "./models/stock-owner-profile.model";
import { ThreePlProfile } from "./models/three-pl-profile.model";
import { VerificationToken } from "./models/verification-token.model";
import { Product } from "./models/product.model";
import { Order } from "./models/order.model";
import { OrderItem } from "./models/order-item.model";
import { Invoice } from "./models/invoice.model";
import { InvoiceLineItem } from "./models/invoice-line-item.model";
import { SubscriptionPlan } from "./models/subscription-plan.model";
import { SubscriptionBillingPeriod } from "./models/subscription-billing-period.model";
import { SubscriptionPayment } from "./models/subscription-payment.model";
import { ExchangeRate } from "./models/exchange-rate.model";
import { InvoiceTemplate } from "./models/invoice-template.model";
import { PlatformSetting } from "./models/platform-setting.model";

export const ALL_MODELS = [
  Company,
  User,
  UserRoleAssignment,
  StaffProfile,
  BackofficeUser,
  BackofficeStaffProfile,
  AccountHolderProfile,
  StockOwnerProfile,
  ThreePlProfile,
  VerificationToken,
  Product,
  Order,
  OrderItem,
  Invoice,
  InvoiceLineItem,
  InvoiceTemplate,
  SubscriptionPlan,
  SubscriptionBillingPeriod,
  SubscriptionPayment,
  ExchangeRate,
  PlatformSetting,
];

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: "postgres",
        uri: config.get<string>("DATABASE_URL"),
        dialectOptions:
          config.get<string>("DB_SSL") === "true"
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : undefined,
        models: ALL_MODELS,
        autoLoadModels: true,
        synchronize: false,
      }),
    }),
    SequelizeModule.forFeature(ALL_MODELS),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
