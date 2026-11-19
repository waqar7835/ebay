import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class OrderItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  /** DROPSHIP only: the line's buy price for all units, in the order's 3PL's currency. Null clears it. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  buyTotal?: number | null;

  /**
   * The client buying price for all units, in the order's Account Holder's currency. Null clears it. DROPSHIP: the client
   * price. STOCK: a manual price replacing sell × qty — Admin / partners only (decided 2026-11-19).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  clientTotal?: number | null;
}
