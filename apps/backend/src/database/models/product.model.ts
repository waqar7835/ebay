import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProductFulfillmentType } from "@ebay-order-management/shared";
import { toNullableDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";

@Table({ tableName: "products", underscored: true })
export class Product extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "stock_owner_id" })
  declare stockOwnerId: string | null;

  @BelongsTo(() => User, "stockOwnerId")
  declare stockOwner: User;

  @Column({
    type: DataType.ENUM(...Object.values(ProductFulfillmentType)),
    allowNull: false,
    defaultValue: ProductFulfillmentType.STOCK,
    field: "fulfillment_type",
  })
  declare fulfillmentType: ProductFulfillmentType;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "three_pl_id" })
  declare threePlId: string | null;

  @BelongsTo(() => User, "threePlId")
  declare threePl: User | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare sku: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare title: string;

  // Free-text size/variant label (e.g. "M", "10.5", "12x8 in"); optional.
  @Column({ type: DataType.STRING, allowNull: true })
  declare size: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "image_url" })
  declare imageUrl: string | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "stock_owner_cost",
    get(this: Product) {
      return toNullableDecimal(this.getDataValue("stockOwnerCost" as keyof Product));
    },
  })
  declare stockOwnerCost: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "buy_price",
    get(this: Product) {
      return toNullableDecimal(this.getDataValue("buyPrice" as keyof Product));
    },
  })
  declare buyPrice: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "sell_price",
    get(this: Product) {
      return toNullableDecimal(this.getDataValue("sellPrice" as keyof Product));
    },
  })
  declare sellPrice: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "stock_quantity" })
  declare stockQuantity: number;
}
