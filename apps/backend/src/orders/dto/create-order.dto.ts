import { IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class CreateOrderDto {
  @IsString()
  accountHolderId!: string;

  @IsString()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

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
}
