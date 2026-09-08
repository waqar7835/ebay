import { Column, DataType, Model, Table } from "sequelize-typescript";
import { toDecimal } from "../decimal.util";

@Table({ tableName: "platform_settings", underscored: true })
export class PlatformSetting extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 10,
    field: "seat_price_per_month",
    get(this: PlatformSetting) {
      return toDecimal(this.getDataValue("seatPricePerMonth" as keyof PlatformSetting));
    },
  })
  declare seatPricePerMonth: number;
}
