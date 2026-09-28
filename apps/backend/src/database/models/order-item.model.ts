import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { toDecimal, toNullableDecimal } from "../decimal.util";
import { Order } from "./order.model";
import { Product } from "./product.model";
import { User } from "./user.model";

/**
 * One product line on an order. Prices and the Stock Owner's share terms are snapshotted per item
 * when the item is added, so each item can belong to a different Stock Owner.
 */
@Table({ tableName: "order_items", underscored: true })
export class OrderItem extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: false, field: "order_id" })
  declare orderId: string;

  @BelongsTo(() => Order)
  declare order: Order;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false, field: "product_id" })
  declare productId: string;

  @BelongsTo(() => Product)
  declare product: Product;

  // Null for DROPSHIP items (no Stock Owner involved).
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "stock_owner_id" })
  declare stockOwnerId: string | null;

  @BelongsTo(() => User, "stockOwnerId")
  declare stockOwner: User | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare position: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare quantity: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "sell_price_snapshot",
    get(this: OrderItem) {
      return toNullableDecimal(this.getDataValue("sellPriceSnapshot" as keyof OrderItem));
    },
  })
  declare sellPriceSnapshot: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "buy_price_snapshot",
    get(this: OrderItem) {
      return toNullableDecimal(this.getDataValue("buyPriceSnapshot" as keyof OrderItem));
    },
  })
  declare buyPriceSnapshot: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "stock_owner_cost_snapshot",
    get(this: OrderItem) {
      return toNullableDecimal(this.getDataValue("stockOwnerCostSnapshot" as keyof OrderItem));
    },
  })
  declare stockOwnerCostSnapshot: number | null;

  @Column({
    type: DataType.ENUM(...Object.values(StockOwnerPayoutMode)),
    allowNull: true,
    field: "stock_owner_payout_mode_snapshot",
  })
  declare stockOwnerPayoutModeSnapshot: StockOwnerPayoutMode | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    field: "stock_owner_share_percent_snapshot",
    get(this: OrderItem) {
      return toNullableDecimal(this.getDataValue("stockOwnerSharePercentSnapshot" as keyof OrderItem));
    },
  })
  declare stockOwnerSharePercentSnapshot: number | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
