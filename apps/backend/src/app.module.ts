import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { CompaniesModule } from "./companies/companies.module";
import { UsersModule } from "./users/users.module";
import { BackofficeUsersModule } from "./backoffice-users/backoffice-users.module";
import { ProductsModule } from "./products/products.module";
import { OrdersModule } from "./orders/orders.module";
import { FinanceModule } from "./finance/finance.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { BillingModule } from "./billing/billing.module";
import { MailerModule } from "./mailer/mailer.module";
import { TokensModule } from "./tokens/tokens.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MailerModule,
    TokensModule,
    AuthModule,
    CompaniesModule,
    UsersModule,
    BackofficeUsersModule,
    ProductsModule,
    OrdersModule,
    FinanceModule,
    InvoicesModule,
    DashboardModule,
    BillingModule,
  ],
})
export class AppModule {}
