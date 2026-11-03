import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { Product } from "./product.model";
import { User } from "./user.model";

/**
 * How many units of a STOCK product one 3PL holds (decided 2026-11-03): a product can be held at several 3PLs. One row
 * per product + 3PL (product_stocks_product_three_pl_unique); `products.stock_quantity` is the total over its rows.
 */
@Table({ tableName: "product_stocks", underscored: true })
export class ProductStock extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false, field: "product_id" })
  declare productId: string;

  @BelongsTo(() => Product, "productId")
  declare product: Product;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "three_pl_id" })
  declare threePlId: string;

  @BelongsTo(() => User, "threePlId")
  declare threePl: User;

  // Can go negative: orders are allowed past the stock on hand (the order form only warns).
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare quantity: number;
}
