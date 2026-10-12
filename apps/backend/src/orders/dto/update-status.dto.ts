import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { OrderStatus } from "@ebay-order-management/shared";

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  /**
   * REFUNDED only: a partial refund — how much of the eBay payout was refunded, in the order's Account Holder
   * currency. Omitted = a full refund. Not allowed on dropship orders (always refunded in full).
   */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  refundAmount?: number;

  /**
   * REFUNDED only, full refunds of STOCK orders: the product is coming back, so its stock goes back on the shelf
   * (decided 2026-10-12). Partial refunds and dropship orders never restock.
   */
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}
