import { Column, DataType, Model, Table } from "sequelize-typescript";
import { Currency } from "@ebay-order-management/shared";
import { toDecimal } from "../decimal.util";

/** Latest known PKR rate per currency — refreshed from the live API, kept as a fallback for when it's down. */
@Table({ tableName: "exchange_rates", underscored: true })
export class ExchangeRate extends Model {
  @Column({ type: DataType.STRING(3), primaryKey: true })
  declare currency: Currency;

  /** PKR per 1 unit of `currency`. */
  @Column({
    type: DataType.DECIMAL(14, 6),
    allowNull: false,
    get(this: ExchangeRate) {
      return toDecimal(this.getDataValue("rate" as keyof ExchangeRate));
    },
  })
  declare rate: number;

  @Column({ type: DataType.DATE, allowNull: false, field: "fetched_at" })
  declare fetchedAt: Date;
}
