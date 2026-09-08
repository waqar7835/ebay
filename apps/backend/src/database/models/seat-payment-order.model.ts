import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { SeatPaymentOrderItem } from "./seat-payment-order-item.model";

export enum SeatPaymentOrderStatus {
  SUBMITTED = "SUBMITTED",
  PAID = "PAID",
  REJECTED = "REJECTED",
}

@Table({ tableName: "seat_payment_orders", underscored: true })
export class SeatPaymentOrder extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "submitted_by_user_id" })
  declare submittedByUserId: string;

  @Column({
    type: DataType.ENUM(...Object.values(SeatPaymentOrderStatus)),
    allowNull: false,
    defaultValue: SeatPaymentOrderStatus.SUBMITTED,
  })
  declare status: SeatPaymentOrderStatus;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "total_amount",
    get(this: SeatPaymentOrder) {
      return toDecimal(this.getDataValue("totalAmount" as keyof SeatPaymentOrder));
    },
  })
  declare totalAmount: number;

  @Column({ type: DataType.STRING, allowNull: true, field: "receipt_file_url" })
  declare receiptFileUrl: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "reference_note" })
  declare referenceNote: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "reviewed_by_user_id" })
  declare reviewedByUserId: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: "reviewed_at" })
  declare reviewedAt: Date | null;

  @HasMany(() => SeatPaymentOrderItem)
  declare items: SeatPaymentOrderItem[];

  declare createdAt: Date;
}
