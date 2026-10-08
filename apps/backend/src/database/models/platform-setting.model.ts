import { Column, DataType, Model, Table } from "sequelize-typescript";
import type { ReplyHoursRow } from "@ebay-order-management/shared";

/** Single row (id = 1) of platform-wide settings, edited by the Super Admin. */
@Table({ tableName: "platform_settings", underscored: true })
export class PlatformSetting extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING, allowNull: false, field: "brand_name" })
  declare brandName: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "logo_url" })
  declare logoUrl: string | null;

  /** Browser-tab icon; null = the logo is used instead. */
  @Column({ type: DataType.STRING, allowNull: true, field: "favicon_url" })
  declare faviconUrl: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "hello_email" })
  declare helloEmail: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "support_email" })
  declare supportEmail: string | null;

  /** Where public contact-form messages are delivered. Never exposed publicly. */
  @Column({ type: DataType.STRING, allowNull: true, field: "contact_email" })
  declare contactEmail: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [], field: "reply_hours" })
  declare replyHours: ReplyHoursRow[];

  @Column({ type: DataType.STRING, allowNull: true, field: "reply_timezone" })
  declare replyTimezone: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "smtp_host" })
  declare smtpHost: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 587, field: "smtp_port" })
  declare smtpPort: number;

  /** true = TLS from the start (usually port 465); false = STARTTLS upgrade (usually 587). */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "smtp_secure" })
  declare smtpSecure: boolean;

  @Column({ type: DataType.STRING, allowNull: true, field: "smtp_user" })
  declare smtpUser: string | null;

  /** AES-256-GCM ciphertext (common/secret-box.util.ts). Write-only from the API's point of view. */
  @Column({ type: DataType.TEXT, allowNull: true, field: "smtp_password_encrypted" })
  declare smtpPasswordEncrypted: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "mail_from_name" })
  declare mailFromName: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "mail_from_email" })
  declare mailFromEmail: string | null;
}
