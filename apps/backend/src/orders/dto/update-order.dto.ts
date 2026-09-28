import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
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
}
