import { Column, DataType, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";

@Table({ tableName: "subscription_plans", underscored: true })
export class SubscriptionPlan extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare description: string | null;

  /** PKR per month, before any billing-period discount. */
  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "price_per_month",
    get(this: SubscriptionPlan) {
      return toDecimal(this.getDataValue("pricePerMonth" as keyof SubscriptionPlan));
    },
  })
  declare pricePerMonth: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "max_account_holders" })
  declare maxAccountHolders: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "max_stock_owners" })
  declare maxStockOwners: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "max_three_pls" })
  declare maxThreePls: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "max_staff" })
  declare maxStaff: number;

  /** Exactly one plan is free — the fallback for every company without an active paid plan. */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "is_free" })
  declare isFree: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true, field: "is_active" })
  declare isActive: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "sort_order" })
  declare sortOrder: number;
}
