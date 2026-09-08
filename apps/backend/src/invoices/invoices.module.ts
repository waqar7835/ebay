import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { Invoice } from "../database/models/invoice.model";
import { InvoiceLineItem } from "../database/models/invoice-line-item.model";
import { AccountHolderProfile } from "../database/models/account-holder-profile.model";
import { StockOwnerProfile } from "../database/models/stock-owner-profile.model";
import { ThreePlProfile } from "../database/models/three-pl-profile.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { FinanceModule } from "../finance/finance.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      Order,
      Invoice,
      InvoiceLineItem,
      AccountHolderProfile,
      StockOwnerProfile,
      ThreePlProfile,
      StaffProfile,
      BackofficeStaffProfile,
    ]),
    FinanceModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
