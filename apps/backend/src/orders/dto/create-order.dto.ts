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

export class CreateOrderDto {
  @IsString()
  accountHolderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsOptional()
  @IsString()
  threePlId?: string;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsString()
  ebayOrderRef!: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsString()
  buyerDetails!: string;

  @IsNumber()
  ebayNetProceeds!: number;

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

  /** PKR rates typed in by the admin (e.g. when the rate API is down), keyed by currency. */
  @IsOptional()
  @IsObject()
  exchangeRates?: ExchangeRates;
}
