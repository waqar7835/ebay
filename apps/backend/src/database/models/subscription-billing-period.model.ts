import { Column, DataType, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";

/** A duration a subscription can be bought for, with its discount off the plan's monthly price. */
@Table({ tableName: "subscription_billing_periods", underscored: true })
export class SubscriptionBillingPeriod extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.INTEGER, allowNull: false, unique: true })
  declare months: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    field: "discount_percent",
    get(this: SubscriptionBillingPeriod) {
      return toDecimal(this.getDataValue("discountPercent" as keyof SubscriptionBillingPeriod));
    },
  })
  declare discountPercent: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true, field: "is_active" })
  declare isActive: boolean;
}
