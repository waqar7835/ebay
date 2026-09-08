import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { toDecimal, toNullableDecimal } from "../decimal.util";
import { User } from "./user.model";

@Table({ tableName: "account_holder_profiles", underscored: true, timestamps: true })
export class AccountHolderProfile extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    field: "share_percent",
    get(this: AccountHolderProfile) {
      return toDecimal(this.getDataValue("sharePercent" as keyof AccountHolderProfile));
    },
  })
  declare sharePercent: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_price_charged",
    get(this: AccountHolderProfile) {
      return toNullableDecimal(this.getDataValue("threePlPriceCharged" as keyof AccountHolderProfile));
    },
  })
  declare threePlPriceCharged: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1, field: "billing_cycle_start_day" })
  declare billingCycleStartDay: number;
}
