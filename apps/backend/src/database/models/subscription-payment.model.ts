import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { SubscriptionPaymentStatus } from "@ebay-order-management/shared";
import { toDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { BackofficeUser } from "./backoffice-user.model";
import { SubscriptionPlan } from "./subscription-plan.model";

/** A company's receipt for a plan + billing period, reviewed by the Super Admin. Plan terms are snapshotted. */
@Table({ tableName: "subscription_payments", underscored: true })
export class SubscriptionPayment extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @BelongsTo(() => Company)
  declare company: Company;

  @ForeignKey(() => SubscriptionPlan)
  @Column({ type: DataType.UUID, allowNull: false, field: "plan_id" })
  declare planId: string;

  @Column({ type: DataType.STRING, allowNull: false, field: "plan_name" })
  declare planName: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare months: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "price_per_month",
    get(this: SubscriptionPayment) {
      return toDecimal(this.getDataValue("pricePerMonth" as keyof SubscriptionPayment));
    },
  })
  declare pricePerMonth: number;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    field: "discount_percent",
    get(this: SubscriptionPayment) {
      return toDecimal(this.getDataValue("discountPercent" as keyof SubscriptionPayment));
    },
  })
  declare discountPercent: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    get(this: SubscriptionPayment) {
      return toDecimal(this.getDataValue("amount" as keyof SubscriptionPayment));
    },
  })
  declare amount: number;

  @Column({
    type: DataType.ENUM(...Object.values(SubscriptionPaymentStatus)),
    allowNull: false,
    defaultValue: SubscriptionPaymentStatus.SUBMITTED,
  })
  declare status: SubscriptionPaymentStatus;

  @Column({ type: DataType.STRING, allowNull: true, field: "receipt_file_url" })
  declare receiptFileUrl: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "reference_note" })
  declare referenceNote: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "submitted_by_user_id" })
  declare submittedByUserId: string | null;

  @ForeignKey(() => BackofficeUser)
  @Column({ type: DataType.UUID, allowNull: true, field: "reviewed_by_backoffice_user_id" })
  declare reviewedByBackofficeUserId: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: "reviewed_at" })
  declare reviewedAt: Date | null;

  @Column({ type: DataType.DATEONLY, allowNull: true, field: "period_start" })
  declare periodStart: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true, field: "period_end" })
  declare periodEnd: string | null;

  declare createdAt: Date;
}
