import { Column, DataType, HasMany, Model, Table } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "companies", underscored: true })
export class Company extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "logo_url" })
  declare logoUrl: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: "email_verified_at" })
  declare emailVerifiedAt: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1, field: "billing_anchor_day" })
  declare billingAnchorDay: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "free_account_holder_used" })
  declare freeAccountHolderUsed: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "free_stock_owner_used" })
  declare freeStockOwnerUsed: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "free_three_pl_used" })
  declare freeThreePlUsed: boolean;

  @HasMany(() => User)
  declare users: User[];
}
