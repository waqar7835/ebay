import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { InvoiceLineDetails, InvoiceLineKind } from "@ebay-order-management/shared";
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

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: InvoiceLineKind.ORDER })
  declare kind: InvoiceLineKind;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare position: number;

  /** Breakdown the PDF is drawn from, snapshotted at approval (null on MISC lines). */
  @Column({ type: DataType.JSONB, allowNull: true })
  declare details: InvoiceLineDetails | null;
}
