import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class ResyncPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID("all", { each: true })
  orderIds!: string[];
}
