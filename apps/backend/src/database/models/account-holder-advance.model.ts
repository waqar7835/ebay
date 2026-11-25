import { Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { AccountHolderAdvanceUsage } from "./account-holder-advance-usage.model";

/**
 * Money an Account Holder paid the company up front (decided 2026-11-25), in the holder's currency (re-read in the new
 * one if it changes). Account Holder invoices use it oldest deposit first; once any of it is used it's locked.
 */
@Table({ tableName: "account_holder_advances", underscored: true, timestamps: true })
export class AccountHolderAdvance extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "account_holder_id" })
  declare accountHolderId: string;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    get(this: AccountHolderAdvance) {
      return toDecimal(this.getDataValue("amount" as keyof AccountHolderAdvance));
    },
  })
  declare amount: number;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "deposit_date" })
  declare depositDate: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "created_by_user_id" })
  declare createdByUserId: string | null;

  @HasMany(() => AccountHolderAdvanceUsage)
  declare usages: AccountHolderAdvanceUsage[];

  declare createdAt: Date;
}
