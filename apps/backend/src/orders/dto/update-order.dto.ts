import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import type { ExchangeRates } from "@ebay-order-management/shared";
import { OrderItemInputDto } from "./order-item.dto";

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  accountHolderId?: string;

  /** Replaces the order's items. Unchanged products keep their snapshots; new ones snapshot current rates. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  /** Null removes a dropship order's 3PL (a Stock order always ships from its products' 3PL). */
  @IsOptional()
  @IsString()
  threePlId?: string | null;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsOptional()
  @IsString()
  ebayOrderRef?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  buyerDetails?: string;

  @IsOptional()
  @IsNumber()
  ebayNetProceeds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsString()
  supplierUrl?: string;

  /** Notes for the 3PL; on update an empty string clears them. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;

  /**
   * PKR rates typed in by the admin (e.g. when the rate API is down), keyed by currency. Every save converts the
   * order with these or, for currencies not sent, today's rates.
   */
  @IsOptional()
  @IsObject()
  exchangeRates?: ExchangeRates;
}
