import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { InvoiceStatus, Role } from "@ebay-order-management/shared";
import { toDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { InvoiceLineItem } from "./invoice-line-item.model";

@Table({ tableName: "invoices", underscored: true })
export class Invoice extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User, "userId")
  declare user: User;

  @Column({ type: DataType.ENUM(...Object.values(Role)), allowNull: false })
  declare role: Role;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "period_start" })
  declare periodStart: string;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "period_end" })
  declare periodEnd: string;

  @Column({
    type: DataType.ENUM(...Object.values(InvoiceStatus)),
    allowNull: false,
    defaultValue: InvoiceStatus.UNPAID,
  })
  declare status: InvoiceStatus;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "total_amount",
    get(this: Invoice) {
      return toDecimal(this.getDataValue("totalAmount" as keyof Invoice));
    },
  })
  declare totalAmount: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "generated_by_user_id" })
  declare generatedByUserId: string;

  @Column({ type: DataType.DATE, allowNull: false, field: "generated_at" })
  declare generatedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: "paid_at" })
  declare paidAt: Date | null;

  @HasMany(() => InvoiceLineItem)
  declare lineItems: InvoiceLineItem[];
}
