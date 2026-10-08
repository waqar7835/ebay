import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsUUID } from "class-validator";
import { OrderStatus } from "@ebay-order-management/shared";

export class BulkUpdateOrderStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUUID("all", { each: true })
  orderIds!: string[];

  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
