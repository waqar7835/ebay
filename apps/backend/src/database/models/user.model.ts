import { BelongsTo, Column, DataType, DefaultScope, ForeignKey, HasMany, HasOne, Model, Scopes, Table } from "sequelize-typescript";
import { UserStatus } from "@ebay-order-management/shared";
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

  @Column({ type: DataType.STRING, allowNull: true, field: "password_hash" })
  declare passwordHash: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(UserStatus)),
    allowNull: false,
    defaultValue: UserStatus.INVITED,
  })
  declare status: UserStatus;

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
