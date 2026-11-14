import { Column, DataType, DefaultScope, HasOne, Model, Scopes, Table } from "sequelize-typescript";
import { Role, UserStatus } from "@ebay-order-management/shared";
import { BackofficeStaffProfile } from "./backoffice-staff-profile.model";

/**
 * Backoffice identities (SUPER_ADMIN, PLATFORM_STAFF) live in a table fully separate from the
 * portal `users` table, so the same email can independently hold a backoffice account and a
 * portal account with separate passwords/roles.
 */
@DefaultScope(() => ({ attributes: { exclude: ["passwordHash"] } }))
@Scopes(() => ({ withPassword: { attributes: { include: ["passwordHash"] } } }))
@Table({ tableName: "backoffice_users", underscored: true })
export class BackofficeUser extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare name: string | null;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "password_hash" })
  declare passwordHash: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(UserStatus)),
    allowNull: false,
    defaultValue: UserStatus.INVITED,
  })
  declare status: UserStatus;

  /** Bumped to end every existing login of this account (password reset/change, disable); tokens carry it as `sv`. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "session_version" })
  declare sessionVersion: number;

  @Column({ type: DataType.ENUM(Role.SUPER_ADMIN, Role.PLATFORM_STAFF), allowNull: false })
  declare role: Role;

  @HasOne(() => BackofficeStaffProfile)
  declare backofficeStaffProfile: BackofficeStaffProfile | null;
}
