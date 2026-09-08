import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { toNullableDecimal } from "../decimal.util";
import { User } from "./user.model";

@Table({ tableName: "stock_owner_profiles", underscored: true, timestamps: true })
export class StockOwnerProfile extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.ENUM(...Object.values(StockOwnerPayoutMode)),
    allowNull: false,
    defaultValue: StockOwnerPayoutMode.FIXED,
    field: "payout_mode",
  })
  declare payoutMode: StockOwnerPayoutMode;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    field: "share_percent",
    get(this: StockOwnerProfile) {
      return toNullableDecimal(this.getDataValue("sharePercent" as keyof StockOwnerProfile));
    },
  })
  declare sharePercent: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1, field: "billing_cycle_start_day" })
  declare billingCycleStartDay: number;
}
