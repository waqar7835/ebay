import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { TokenPurpose } from "@ebay-order-management/shared";
import { Company } from "./company.model";
import { User } from "./user.model";
import { BackofficeUser } from "./backoffice-user.model";

@Table({ tableName: "verification_tokens", underscored: true })
export class VerificationToken extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare token: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare email: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true, field: "company_id" })
  declare companyId: string | null;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "user_id" })
  declare userId: string | null;

  @ForeignKey(() => BackofficeUser)
  @Column({ type: DataType.UUID, allowNull: true, field: "backoffice_user_id" })
  declare backofficeUserId: string | null;

  @Column({ type: DataType.ENUM(...Object.values(TokenPurpose)), allowNull: false })
  declare purpose: TokenPurpose;

  @Column({ type: DataType.DATE, allowNull: false, field: "expires_at" })
  declare expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: "used_at" })
  declare usedAt: Date | null;
}
