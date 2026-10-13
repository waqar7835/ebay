import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
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

  // Set on a variation: its main product. Title, type, Stock Owner and 3PL are kept in sync with the main product.
  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: true, field: "parent_product_id" })
  declare parentProductId: string | null;

  @BelongsTo(() => Product, "parentProductId")
  declare parentProduct: Product | null;

  // Ordered by `position`.
  @HasMany(() => Product, "parentProductId")
  declare variations: Product[];

  // Order of a variation among its main product's variations.
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare position: number;

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

  // Free-text color label (e.g. "Red", "Navy"); optional.
  @Column({ type: DataType.STRING, allowNull: true })
  declare color: string | null;

  // Free-text size/variant label (e.g. "M", "10.5", "12x8 in"); optional.
  @Column({ type: DataType.STRING, allowNull: true })
  declare size: string | null;

  // Cover image — always imageUrls[0] (or null); kept denormalized so display sites read one field.
  @Column({ type: DataType.STRING, allowNull: true, field: "image_url" })
  declare imageUrl: string | null;

  // Ordered gallery, max PRODUCT_MAX_IMAGES; first entry is the cover.
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [], field: "image_urls" })
  declare imageUrls: string[];

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
