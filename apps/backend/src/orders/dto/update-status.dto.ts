import { IsEnum } from "class-validator";
import { OrderStatus } from "@ebay-order-management/shared";

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
