import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsString()
  threePlId?: string;

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

  /** PKR rates typed in by the admin (e.g. when the rate API is down), keyed by currency. */
  @IsOptional()
  @IsObject()
  exchangeRates?: ExchangeRates;

  /**
   * Re-convert every amount with fresh rates (`exchangeRates` overrides, the rest from the live API).
   * Without it the order keeps its locked rates; only a currency new to the order gets a rate.
   */
  @IsOptional()
  @IsBoolean()
  recalculateRates?: boolean;
}
