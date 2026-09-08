import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProductFulfillmentType } from "@ebay-order-management/shared";
import { toDecimal } from "../decimal.util";
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
  @Column({ type: DataType.UUID, allowNull: false, field: "stock_owner_id" })
  declare stockOwnerId: string;

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

  @Column({ type: DataType.STRING, allowNull: true, field: "image_url" })
  declare imageUrl: string | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "stock_owner_cost",
    get(this: Product) {
      return toDecimal(this.getDataValue("stockOwnerCost" as keyof Product));
    },
  })
  declare stockOwnerCost: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "buy_price",
    get(this: Product) {
      return toDecimal(this.getDataValue("buyPrice" as keyof Product));
    },
  })
  declare buyPrice: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "sell_price",
    get(this: Product) {
      return toDecimal(this.getDataValue("sellPrice" as keyof Product));
    },
  })
  declare sellPrice: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "stock_quantity" })
  declare stockQuantity: number;
}
