import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";
import { User } from "./user.model";

@Table({ tableName: "three_pl_profiles", underscored: true, timestamps: true })
export class ThreePlProfile extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "payout_per_order",
    get(this: ThreePlProfile) {
      return toDecimal(this.getDataValue("payoutPerOrder" as keyof ThreePlProfile));
    },
  })
  declare payoutPerOrder: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1, field: "billing_cycle_start_day" })
  declare billingCycleStartDay: number;
}
