import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "seat_billings", underscored: true, timestamps: true })
export class SeatBilling extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.DATEONLY, allowNull: true, field: "paid_through_date" })
  declare paidThroughDate: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "reminders_sent_count" })
  declare remindersSentCount: number;

  @Column({ type: DataType.DATE, allowNull: true, field: "last_reminder_sent_at" })
  declare lastReminderSentAt: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare blocked: boolean;
}
