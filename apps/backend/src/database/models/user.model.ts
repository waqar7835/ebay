import { BelongsTo, Column, DataType, DefaultScope, ForeignKey, HasMany, HasOne, Model, Scopes, Table } from "sequelize-typescript";
import { Currency, DEFAULT_CURRENCY, UserStatus } from "@ebay-order-management/shared";
import { Company } from "./company.model";
import { UserRoleAssignment } from "./user-role.model";
import { StaffProfile } from "./staff-profile.model";
import { AccountHolderProfile } from "./account-holder-profile.model";
import { StockOwnerProfile } from "./stock-owner-profile.model";
import { ThreePlProfile } from "./three-pl-profile.model";

@DefaultScope(() => ({ attributes: { exclude: ["passwordHash"] } }))
@Scopes(() => ({ withPassword: { attributes: { include: ["passwordHash"] } } }))
@Table({ tableName: "users", underscored: true })
export class User extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true, field: "company_id" })
  declare companyId: string | null;

  @BelongsTo(() => Company)
  declare company: Company;

  @Column({ type: DataType.STRING, allowNull: true })
  declare name: string | null;

  // Not unique: a company can invite the same email address as multiple role-scoped accounts
  // (Staff, Account Holder, Stock Owner, 3PL); uniqueness is enforced per (email, role) in UsersService.
  @Column({ type: DataType.STRING, allowNull: false })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "avatar_url" })
  declare avatarUrl: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "password_hash" })
  declare passwordHash: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(UserStatus)),
    allowNull: false,
    defaultValue: UserStatus.INVITED,
  })
  declare status: UserStatus;

  /** Set when the account was disabled because the company's subscription expired (restored on renewal). */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "disabled_by_subscription" })
  declare disabledBySubscription: boolean;

  /** When the user set their password. Null = never accepted the invite, so re-enabling returns them to INVITED. */
  @Column({ type: DataType.DATE, allowNull: true, field: "invite_accepted_at" })
  declare inviteAcceptedAt: Date | null;

  // Currency this user's amounts (3PL fee, product prices, eBay proceeds…) are entered in. Orders
  // convert them to PKR. Only meaningful for Account Holder / Stock Owner / 3PL accounts.
  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: DEFAULT_CURRENCY })
  declare currency: Currency;

  @HasMany(() => UserRoleAssignment)
  declare roleAssignments: UserRoleAssignment[];

  @HasOne(() => StaffProfile)
  declare staffProfile: StaffProfile | null;

  @HasOne(() => AccountHolderProfile)
  declare accountHolderProfile: AccountHolderProfile | null;

  @HasOne(() => StockOwnerProfile)
  declare stockOwnerProfile: StockOwnerProfile | null;

  @HasOne(() => ThreePlProfile)
  declare threePlProfile: ThreePlProfile | null;
}
