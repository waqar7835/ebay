import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

export class ThreePlBuyTotalDto {
  @IsString()
  itemId!: string;

  /** What the 3PL paid for this line, all units together, in their own currency. */
  @IsNumber()
  @Min(0)
  buyTotal!: number;
}

/**
 * What a 3PL may change on its own order from the orders list (decided 2026-10-08). A DROPSHIP 3PL: the line buy
 * totals and the supplier URL, while the order is PROCESSING. A STOCK 3PL: the tracking number, while the order is
 * PROCESSING or SHIPPED. Omitted fields are left as they are; an empty string clears the supplier URL / tracking number.
 * Shipping is a status change (PATCH /orders/status or /orders/:id/status), not part of this.
 */
export class ThreePlFulfillmentDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThreePlBuyTotalDto)
  buyTotals?: ThreePlBuyTotalDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  supplierUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  trackingNumber?: string;

}
