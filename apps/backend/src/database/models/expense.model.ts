import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ExpenseChargedTo } from "@ebay-order-management/shared";
import { toDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { ExpenseCategory } from "./expense-category.model";
import { User } from "./user.model";

/**
 * An expense the Admin or a partner booked (2026-11-05), in PKR. Deducted from whoever it's charged to (the company,
 * the Admin or a partner) in the billing cycle of `expenseDate`; frozen once that cycle's profit statement exists.
 */
@Table({ tableName: "expenses", underscored: true, timestamps: true })
export class Expense extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare title: string;

  @Column({
    type: DataType.DECIMAL(14, 2),
    allowNull: false,
    get(this: Expense) {
      return toDecimal(this.getDataValue("amount" as keyof Expense));
    },
  })
  declare amount: number;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "expense_date" })
  declare expenseDate: string;

  @ForeignKey(() => ExpenseCategory)
  @Column({ type: DataType.UUID, allowNull: true, field: "category_id" })
  declare categoryId: string | null;

  @BelongsTo(() => ExpenseCategory)
  declare category: ExpenseCategory | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.ENUM(...Object.values(ExpenseChargedTo)), allowNull: false, field: "charged_to" })
  declare chargedTo: ExpenseChargedTo;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "charged_to_user_id" })
  declare chargedToUserId: string | null;

  @BelongsTo(() => User, "chargedToUserId")
  declare chargedToUser: User | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "created_by_user_id" })
  declare createdByUserId: string;

  @BelongsTo(() => User, "createdByUserId")
  declare createdBy: User;

  @Column({ type: DataType.UUID, allowNull: true, field: "profit_statement_id" })
  declare profitStatementId: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
