import { IsNumber, Min } from "class-validator";

export class DropshipBuyPriceDto {
  @IsNumber()
  @Min(0)
  buyPrice!: number;
}
