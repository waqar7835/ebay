import { IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  accountHolderId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

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
}
