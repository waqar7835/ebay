import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";
import { AccountHolderAdvance } from "./account-holder-advance.model";
import { Invoice } from "./invoice.model";

/** How much of one advance deposit an Account Holder invoice used (2026-11-25). */
@Table({ tableName: "account_holder_advance_usages", underscored: true, timestamps: true })
export class AccountHolderAdvanceUsage extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => AccountHolderAdvance)
  @Column({ type: DataType.UUID, allowNull: false, field: "advance_id" })
  declare advanceId: string;

  @ForeignKey(() => Invoice)
  @Column({ type: DataType.UUID, allowNull: false, field: "invoice_id" })
  declare invoiceId: string;

  @BelongsTo(() => Invoice)
  declare invoice: Invoice;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    get(this: AccountHolderAdvanceUsage) {
      return toDecimal(this.getDataValue("amount" as keyof AccountHolderAdvanceUsage));
    },
  })
  declare amount: number;
}
