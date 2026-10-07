import { IsNumber, IsString, Min } from "class-validator";

export class DropshipBuyPriceDto {
  @IsString()
  itemId!: string;

  /** What the 3PL paid for this line, all units together, in their own currency. */
  @IsNumber()
  @Min(0)
  buyTotal!: number;
}
