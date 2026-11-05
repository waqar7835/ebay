import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import type { InvoiceTemplateSnapshot, ProfitCycleDto } from "@ebay-order-management/shared";
import { toDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";

/**
 * One billing cycle's frozen profit statement (2026-11-05): the whole breakdown, split and expenses as generated, so
 * its PDFs never change. Generated oldest first; only the latest can be deleted (which unfreezes its cycle).
 */
@Table({ tableName: "profit_statements", underscored: true, timestamps: true })
export class ProfitStatement extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  /** e.g. AD-PS-2026-004 — its own per-company counter (companies.last_profit_statement_sequence). */
  @Column({ type: DataType.STRING(32), allowNull: false, field: "statement_number" })
  declare statementNumber: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sequence: number;

  /** Inclusive YYYY-MM-DD bounds of the billing cycle. */
  @Column({ type: DataType.DATEONLY, allowNull: false, field: "cycle_start" })
  declare cycleStart: string;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "cycle_end" })
  declare cycleEnd: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "generated_by_user_id" })
  declare generatedByUserId: string;

  @Column({ type: DataType.DATE, allowNull: false, field: "generated_at" })
  declare generatedAt: Date;

  /** Invoice template style frozen at generation. */
  @Column({ type: DataType.JSONB, allowNull: true })
  declare template: InvoiceTemplateSnapshot | null;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare snapshot: ProfitCycleDto;

  @Column({
    type: DataType.DECIMAL(14, 2),
    allowNull: false,
    defaultValue: 0,
    field: "total_profit",
    get(this: ProfitStatement) {
      return toDecimal(this.getDataValue("totalProfit" as keyof ProfitStatement));
    },
  })
  declare totalProfit: number;

  @Column({
    type: DataType.DECIMAL(14, 2),
    allowNull: false,
    defaultValue: 0,
    field: "company_closing_balance",
    get(this: ProfitStatement) {
      return toDecimal(this.getDataValue("companyClosingBalance" as keyof ProfitStatement));
    },
  })
  declare companyClosingBalance: number;
}
