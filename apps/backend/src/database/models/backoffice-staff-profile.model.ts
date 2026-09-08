import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { BackofficeUser } from "./backoffice-user.model";

/**
 * Global (not company-scoped) permission flags for a PLATFORM_STAFF backoffice user — mirrors
 * StaffProfile's boolean flags, minus the revenue-share fields which are payroll-specific to
 * company-scoped STAFF and don't apply here.
 */
@Table({ tableName: "backoffice_staff_profiles", underscored: true, timestamps: true })
export class BackofficeStaffProfile extends Model {
  @ForeignKey(() => BackofficeUser)
  @Column({ type: DataType.UUID, primaryKey: true, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => BackofficeUser)
  declare user: BackofficeUser;

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
}
