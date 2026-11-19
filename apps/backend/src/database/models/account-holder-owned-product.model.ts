import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { Product } from "./product.model";
import { User } from "./user.model";

/**
 * A main product the Account Holder owns (decided 2026-11-19): one of its linked Stock Owner account's products. On
 * orders, owned lines charge the Account Holder the cost (see OwnerPricingService). Variations follow their main product.
 */
@Table({ tableName: "account_holder_owned_products", underscored: true, timestamps: true })
export class AccountHolderOwnedProduct extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true, field: "account_holder_id" })
  declare accountHolderId: string;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, primaryKey: true, field: "product_id" })
  declare productId: string;

  @BelongsTo(() => Product)
  declare product: Product;
}
