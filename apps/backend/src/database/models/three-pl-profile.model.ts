import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProductFulfillmentType } from "@ebay-order-management/shared";
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

  @Column({
    type: DataType.ENUM(...Object.values(ProductFulfillmentType)),
    allowNull: false,
    defaultValue: ProductFulfillmentType.STOCK,
    field: "fulfillment_type",
  })
  declare fulfillmentType: ProductFulfillmentType;

  /**
   * Auto-delivery (decided 2026-10-08): when on, an order this 3PL marks shipped after `autoDeliveryEnabledAt` moves to
   * DELIVERED once `deliveryDays` have passed (a STOCK order also needs its tracking number first). Off by default.
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "auto_delivery_enabled" })
  declare autoDeliveryEnabled: boolean;

  @Column({ type: DataType.INTEGER, allowNull: true, field: "delivery_days" })
  declare deliveryDays: number | null;

  /** When auto-delivery was last switched on — orders shipped before then are never auto-delivered. */
  @Column({ type: DataType.DATE, allowNull: true, field: "auto_delivery_enabled_at" })
  declare autoDeliveryEnabledAt: Date | null;
}
