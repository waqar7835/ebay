import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";
import { Invoice } from "./invoice.model";
import { Order } from "./order.model";

@Table({ tableName: "invoice_line_items", underscored: true, timestamps: true })
export class InvoiceLineItem extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Invoice)
  @Column({ type: DataType.UUID, allowNull: false, field: "invoice_id" })
  declare invoiceId: string;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: true, field: "order_id" })
  declare orderId: string | null;

  @BelongsTo(() => Order)
  declare order: Order | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare description: string;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "gross_amount",
    get(this: InvoiceLineItem) {
      return toDecimal(this.getDataValue("grossAmount" as keyof InvoiceLineItem));
    },
  })
  declare grossAmount: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "deduction_amount",
    get(this: InvoiceLineItem) {
      return toDecimal(this.getDataValue("deductionAmount" as keyof InvoiceLineItem));
    },
  })
  declare deductionAmount: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "net_amount",
    get(this: InvoiceLineItem) {
      return toDecimal(this.getDataValue("netAmount" as keyof InvoiceLineItem));
    },
  })
  declare netAmount: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: "is_adjustment" })
  declare isAdjustment: boolean;
}
