import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { Role } from "@ebay-order-management/shared";
import { User } from "./user.model";

@Table({ tableName: "user_roles", underscored: true })
export class UserRoleAssignment extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.ENUM(...Object.values(Role)), allowNull: false })
  declare role: Role;
}
