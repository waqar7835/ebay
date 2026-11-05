import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { Company } from "./company.model";

/** Admin-managed list of expense categories, per company (2026-11-05). */
@Table({ tableName: "expense_categories", underscored: true, timestamps: true })
export class ExpenseCategory extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @Column({ type: DataType.STRING(60), allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare position: number;
}
