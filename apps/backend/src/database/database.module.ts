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
import { Invoice } from "./models/invoice.model";
import { InvoiceLineItem } from "./models/invoice-line-item.model";
import { PlatformSetting } from "./models/platform-setting.model";
import { SeatBilling } from "./models/seat-billing.model";
import { SeatPaymentOrder } from "./models/seat-payment-order.model";
import { SeatPaymentOrderItem } from "./models/seat-payment-order-item.model";

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
  Invoice,
  InvoiceLineItem,
  PlatformSetting,
  SeatBilling,
  SeatPaymentOrder,
  SeatPaymentOrderItem,
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
