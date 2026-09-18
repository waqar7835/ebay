import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { OrderStatus, StockOwnerPayoutMode } from "@ebay-order-management/shared";
import { toDecimal, toNullableDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { Product } from "./product.model";

@Table({ tableName: "orders", underscored: true })
export class Order extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "account_holder_id" })
  declare accountHolderId: string;

  @BelongsTo(() => User, "accountHolderId")
  declare accountHolder: User;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "stock_owner_id" })
  declare stockOwnerId: string;

  @BelongsTo(() => User, "stockOwnerId")
  declare stockOwner: User;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false, field: "product_id" })
  declare productId: string;

  @BelongsTo(() => Product)
  declare product: Product;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare quantity: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "three_pl_id" })
  declare threePlId: string | null;

  @BelongsTo(() => User, "threePlId")
  declare threePl: User | null;

  @Column({
    type: DataType.ENUM(...Object.values(OrderStatus)),
    allowNull: false,
    defaultValue: OrderStatus.PENDING,
  })
  declare status: OrderStatus;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "order_date" })
  declare orderDate: string;

  @Column({ type: DataType.STRING, allowNull: false, field: "ebay_order_ref" })
  declare ebayOrderRef: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "tracking_number" })
  declare trackingNumber: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "shipping_label_url" })
  declare shippingLabelUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, field: "buyer_details" })
  declare buyerDetails: string;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "ebay_net_proceeds",
    get(this: Order) {
      return toDecimal(this.getDataValue("ebayNetProceeds" as keyof Order));
    },
  })
  declare ebayNetProceeds: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "shipping_cost",
    get(this: Order) {
      return toDecimal(this.getDataValue("shippingCost" as keyof Order));
    },
  })
  declare shippingCost: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "sell_price_snapshot",
    get(this: Order) {
      return toDecimal(this.getDataValue("sellPriceSnapshot" as keyof Order));
    },
  })
  declare sellPriceSnapshot: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "buy_price_snapshot",
    get(this: Order) {
      return toDecimal(this.getDataValue("buyPriceSnapshot" as keyof Order));
    },
  })
  declare buyPriceSnapshot: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "stock_owner_cost_snapshot",
    get(this: Order) {
      return toDecimal(this.getDataValue("stockOwnerCostSnapshot" as keyof Order));
    },
  })
  declare stockOwnerCostSnapshot: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_price_charged_snapshot",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("threePlPriceChargedSnapshot" as keyof Order));
    },
  })
  declare threePlPriceChargedSnapshot: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_payout_snapshot",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("threePlPayoutSnapshot" as keyof Order));
    },
  })
  declare threePlPayoutSnapshot: number | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    field: "account_holder_share_percent_snapshot",
    get(this: Order) {
      return toDecimal(this.getDataValue("accountHolderSharePercentSnapshot" as keyof Order));
    },
  })
  declare accountHolderSharePercentSnapshot: number;

  @Column({
    type: DataType.ENUM(...Object.values(StockOwnerPayoutMode)),
    allowNull: false,
    field: "stock_owner_payout_mode_snapshot",
  })
  declare stockOwnerPayoutModeSnapshot: StockOwnerPayoutMode;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    field: "stock_owner_share_percent_snapshot",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("stockOwnerSharePercentSnapshot" as keyof Order));
    },
  })
  declare stockOwnerSharePercentSnapshot: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare restocked: boolean;

  @Column({ type: DataType.DATE, allowNull: true, field: "delivered_at" })
  declare deliveredAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: false, field: "status_changed_at" })
  declare statusChangedAt: Date;

  declare createdAt: Date;
  declare updatedAt: Date;
}
