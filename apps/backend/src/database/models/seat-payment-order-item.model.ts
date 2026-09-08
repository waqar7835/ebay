import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";
import { SeatPaymentOrder } from "./seat-payment-order.model";
import { User } from "./user.model";

@Table({ tableName: "seat_payment_order_items", underscored: true, timestamps: true })
export class SeatPaymentOrderItem extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => SeatPaymentOrder)
  @Column({ type: DataType.UUID, allowNull: false, field: "seat_payment_order_id" })
  declare seatPaymentOrderId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "user_id" })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "period_start" })
  declare periodStart: string;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "period_end" })
  declare periodEnd: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare months: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    get(this: SeatPaymentOrderItem) {
      return toDecimal(this.getDataValue("amount" as keyof SeatPaymentOrderItem));
    },
  })
  declare amount: number;
}
