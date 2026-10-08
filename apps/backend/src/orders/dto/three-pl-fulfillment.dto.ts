import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

export class ThreePlBuyTotalDto {
  @IsString()
  itemId!: string;

  /** What the 3PL paid for this line, all units together, in their own currency. */
  @IsNumber()
  @Min(0)
  buyTotal!: number;
}

/**
 * What a DROPSHIP 3PL may change on its own order from the orders list's Edit popup. Omitted fields are left as they
 * are; an empty string clears the supplier URL / tracking number.
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

  /** PROCESSING -> SHIPPED, the only status move a 3PL makes. */
  @IsOptional()
  @IsBoolean()
  markShipped?: boolean;
}
