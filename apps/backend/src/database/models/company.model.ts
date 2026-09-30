import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { Currency, DEFAULT_CURRENCY } from "@ebay-order-management/shared";
import { User } from "./user.model";
import { SubscriptionPlan } from "./subscription-plan.model";

@Table({ tableName: "companies", underscored: true })
export class Company extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "logo_url" })
  declare logoUrl: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: "email_verified_at" })
  declare emailVerifiedAt: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1, field: "billing_anchor_day" })
  declare billingAnchorDay: number;

  // Preselected when inviting Account Holders / Stock Owners / 3PLs; each user keeps their own currency.
  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: DEFAULT_CURRENCY, field: "default_currency" })
  declare defaultCurrency: Currency;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 3, field: "stale_order_days" })
  declare staleOrderDays: number;

  /** Last invoice number handed out, so a deleted invoice's number is never reused. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "last_invoice_sequence" })
  declare lastInvoiceSequence: number;

  /** The paid plan the company is on; null = the free plan. */
  @ForeignKey(() => SubscriptionPlan)
  @Column({ type: DataType.UUID, allowNull: true, field: "subscription_plan_id" })
  declare subscriptionPlanId: string | null;

  @BelongsTo(() => SubscriptionPlan)
  declare subscriptionPlan: SubscriptionPlan | null;

  /** Last day (inclusive, YYYY-MM-DD) of the paid plan; null on the free plan. */
  @Column({ type: DataType.DATEONLY, allowNull: true, field: "subscription_ends_at" })
  declare subscriptionEndsAt: string | null;

  /** Expiry reminders sent for the current term: 1 = the 5-day one, 2 = the 1-day one too. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: "subscription_reminders_sent" })
  declare subscriptionRemindersSent: number;

  @HasMany(() => User)
  declare users: User[];
}
