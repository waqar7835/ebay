import { IsInt, IsPositive, IsString } from "class-validator";

export class OrderItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}
