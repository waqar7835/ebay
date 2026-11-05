import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { Order } from "../database/models/order.model";
import { Invoice } from "../database/models/invoice.model";
import { InvoiceLineItem } from "../database/models/invoice-line-item.model";
import { User } from "../database/models/user.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { Expense } from "../database/models/expense.model";
import { ExpenseCategory } from "../database/models/expense-category.model";
import { ProfitStatement } from "../database/models/profit-statement.model";
import { FinanceModule } from "../finance/finance.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { ProfitController } from "./profit.controller";
import { ProfitService } from "./profit.service";
import { ExpensesService } from "./expenses.service";
import { ProfitAccessService } from "./profit-access.service";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Company,
      Order,
      Invoice,
      InvoiceLineItem,
      User,
      StaffProfile,
      Expense,
      ExpenseCategory,
      ProfitStatement,
    ]),
    FinanceModule,
    ExchangeRatesModule,
    InvoicesModule,
  ],
  controllers: [ProfitController],
  providers: [ProfitService, ExpensesService, ProfitAccessService],
})
export class ProfitModule {}
