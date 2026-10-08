import { BelongsTo, Column, DataType, DefaultScope, ForeignKey, HasMany, Model, Table } from "sequelize-typescript";
import { Currency, ExchangeRates, OrderStatus } from "@ebay-order-management/shared";
import { toDecimal, toNullableDecimal } from "../decimal.util";
import { Company } from "./company.model";
import { User } from "./user.model";
import { OrderItem } from "./order-item.model";

// Items are always loaded (in position order): every financial calculation needs them.
@DefaultScope(() => ({ include: [{ model: OrderItem, separate: true, order: [["position", "ASC"]] }] }))
@Table({ tableName: "orders", underscored: true })
export class Order extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: "account_holder_id" })
  declare accountHolderId: string;

  @BelongsTo(() => User, "accountHolderId")
  declare accountHolder: User;

  /** One or more products. Several items only for STOCK products; a DROPSHIP order has exactly one. */
  @HasMany(() => OrderItem)
  declare items: OrderItem[];

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: "three_pl_id" })
  declare threePlId: string | null;

  @BelongsTo(() => User, "threePlId")
  declare threePl: User | null;

  @Column({
    type: DataType.ENUM(...Object.values(OrderStatus)),
    allowNull: false,
    defaultValue: OrderStatus.PENDING,
  })
  declare status: OrderStatus;

  @Column({ type: DataType.DATEONLY, allowNull: false, field: "order_date" })
  declare orderDate: string;

  @Column({ type: DataType.STRING, allowNull: false, field: "ebay_order_ref" })
  declare ebayOrderRef: string;

  @Column({ type: DataType.STRING, allowNull: true, field: "tracking_number" })
  declare trackingNumber: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "shipping_label_url" })
  declare shippingLabelUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, field: "buyer_details" })
  declare buyerDetails: string;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: "ebay_net_proceeds",
    get(this: Order) {
      return toDecimal(this.getDataValue("ebayNetProceeds" as keyof Order));
    },
  })
  declare ebayNetProceeds: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    field: "shipping_cost",
    get(this: Order) {
      return toDecimal(this.getDataValue("shippingCost" as keyof Order));
    },
  })
  declare shippingCost: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_price_charged_snapshot",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("threePlPriceChargedSnapshot" as keyof Order));
    },
  })
  declare threePlPriceChargedSnapshot: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_payout_snapshot",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("threePlPayoutSnapshot" as keyof Order));
    },
  })
  declare threePlPayoutSnapshot: number | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    field: "account_holder_share_percent_snapshot",
    get(this: Order) {
      return toDecimal(this.getDataValue("accountHolderSharePercentSnapshot" as keyof Order));
    },
  })
  declare accountHolderSharePercentSnapshot: number;

  // Every amount above is in PKR. The fields below record what was entered and how it was converted:
  // Account Holder amounts (eBay proceeds, shipping, 3PL price charged) are in accountHolderCurrency,
  // the 3PL payout in threePlCurrency, each item's prices in its own `currency`. All null on orders
  // from before currencies existed — those amounts are plain PKR until the order is next saved.
  @Column({ type: DataType.STRING(3), allowNull: true, field: "account_holder_currency" })
  declare accountHolderCurrency: Currency | null;

  @Column({ type: DataType.STRING(3), allowNull: true, field: "three_pl_currency" })
  declare threePlCurrency: Currency | null;

  /** PKR per 1 unit of each currency on the order — today's rates as of the last admin save; frozen while the order is on an invoice. */
  @Column({
    type: DataType.JSONB,
    allowNull: true,
    field: "exchange_rates",
    get(this: Order) {
      const rates = this.getDataValue("exchangeRates" as keyof Order) as Record<string, unknown> | null;
      if (!rates) return null;
      return Object.fromEntries(Object.entries(rates).map(([currency, rate]) => [currency, toDecimal(rate)]));
    },
  })
  declare exchangeRates: ExchangeRates | null;

  @Column({ type: DataType.DATE, allowNull: true, field: "exchange_rates_at" })
  declare exchangeRatesAt: Date | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "ebay_net_proceeds_original",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("ebayNetProceedsOriginal" as keyof Order));
    },
  })
  declare ebayNetProceedsOriginal: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "shipping_cost_original",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("shippingCostOriginal" as keyof Order));
    },
  })
  declare shippingCostOriginal: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_price_charged_original",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("threePlPriceChargedOriginal" as keyof Order));
    },
  })
  declare threePlPriceChargedOriginal: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "three_pl_payout_original",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("threePlPayoutOriginal" as keyof Order));
    },
  })
  declare threePlPayoutOriginal: number | null;

  // REFUNDED orders: how much of the eBay payout was refunded (full = the whole payout; dropship orders are always
  // full). Entered in the Account Holder's currency (refundAmountOriginal) and kept in PKR (refundAmount).
  // Null while the order isn't REFUNDED.
  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "refund_amount",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("refundAmount" as keyof Order));
    },
  })
  declare refundAmount: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: "refund_amount_original",
    get(this: Order) {
      return toNullableDecimal(this.getDataValue("refundAmountOriginal" as keyof Order));
    },
  })
  declare refundAmountOriginal: number | null;

  // Invoice that paid this order out to its Account Holder / 3PL — null means still open for that role.
  // The *Refund* ones hold the invoice that carried the negative adjustment after a refund.
  // (Stock Owner status is per item, on order_items.)
  @Column({ type: DataType.UUID, allowNull: true, field: "account_holder_invoice_id" })
  declare accountHolderInvoiceId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: "account_holder_refund_invoice_id" })
  declare accountHolderRefundInvoiceId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: "three_pl_invoice_id" })
  declare threePlInvoiceId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: "three_pl_refund_invoice_id" })
  declare threePlRefundInvoiceId: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: "supplier_url" })
  declare supplierUrl: string | null;

  /** Admin/Staff notes for the 3PL. Only managers and 3PLs receive it (see OrdersService.forRequester). */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare comments: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare restocked: boolean;

  @Column({ type: DataType.DATE, allowNull: true, field: "delivered_at" })
  declare deliveredAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: false, field: "status_changed_at" })
  declare statusChangedAt: Date;

  declare createdAt: Date;
  declare updatedAt: Date;
}
