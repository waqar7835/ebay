import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { OrderItem } from "../database/models/order-item.model";
import { Product } from "../database/models/product.model";
import { Invoice } from "../database/models/invoice.model";
import { InvoiceLineItem } from "../database/models/invoice-line-item.model";
import { InvoiceTemplate } from "../database/models/invoice-template.model";
import { User } from "../database/models/user.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { FinanceModule } from "../finance/finance.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { InvoiceTemplatesController } from "./templates/invoice-templates.controller";
import { InvoiceTemplatesService } from "./templates/invoice-templates.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      Order,
      OrderItem,
      Product,
      Invoice,
      InvoiceLineItem,
      InvoiceTemplate,
      User,
      StaffProfile,
      BackofficeStaffProfile,
    ]),
    FinanceModule,
    ExchangeRatesModule,
  ],
  controllers: [InvoicesController, InvoiceTemplatesController],
  providers: [InvoicesService, InvoiceTemplatesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
