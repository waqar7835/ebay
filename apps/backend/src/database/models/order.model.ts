import { BelongsTo, Column, DataType, DefaultScope, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { OrderStatus } from "@ebay-order-management/shared";
import { toDecimal, toNullableDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { OrderItem } from "./order-item.model";

// Items are always loaded (in position order): every financial calculation needs them.
@DefaultScope(() => ({ include: [{ model: OrderItem, separate: true, order: [["position", "ASC"]] }] }))
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

  /** One or more products. Several items only for STOCK products; a DROPSHIP order has exactly one. */
  @HasMany(() => OrderItem)
  declare items: OrderItem[];

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

  @Column({ type: DataType.STRING, allowNull: true, field: "supplier_url" })
  declare supplierUrl: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare restocked: boolean;

  @Column({ type: DataType.DATE, allowNull: true, field: "delivered_at" })
  declare deliveredAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: false, field: "status_changed_at" })
  declare statusChangedAt: Date;

  declare createdAt: Date;
  declare updatedAt: Date;
}
