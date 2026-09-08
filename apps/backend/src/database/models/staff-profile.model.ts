import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { toNullableDecimal } from "../decimal.util";
import { User } from "./user.model";

@Table({ tableName: "staff_profiles", underscored: true, timestamps: true })
export class StaffProfile extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "can_manage_orders" })
  declare canManageOrders: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "can_manage_stock" })
  declare canManageStock: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "can_manage_users" })
  declare canManageUsers: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "can_generate_invoices" })
  declare canGenerateInvoices: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "can_view_financials" })
  declare canViewFinancials: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "has_revenue_share" })
  declare hasRevenueShare: boolean;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    field: "share_percent",
    get(this: StaffProfile) {
      return toNullableDecimal(this.getDataValue("sharePercent" as keyof StaffProfile));
    },
  })
  declare sharePercent: number | null;
}
