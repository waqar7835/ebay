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

  /** Can generate / delete profit statements (Admin always can). Only meaningful for partners. */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "can_manage_profit_statements" })
  declare canManageProfitStatements: boolean;

  /** A partner takes `partnerPercent`% of the company's profit each billing cycle (replaces "Revenue share", 2026-11-05). */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "is_partner" })
  declare isPartner: boolean;

  /**
   * A partner with Admin access (2026-11-13): treated as the company Admin everywhere, except it can't change the
   * Admin's account or any partner's settings. Set only by the real Admin; cleared when the account stops being a partner.
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "has_admin_access" })
  declare hasAdminAccess: boolean;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: true,
    field: "partner_percent",
    get(this: StaffProfile) {
      return toNullableDecimal(this.getDataValue("partnerPercent" as keyof StaffProfile));
    },
  })
  declare partnerPercent: number | null;
}
