import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { ProductFulfillmentType } from "@ebay-order-management/shared";

export class CreateProductDto {
  @IsString()
  stockOwnerId!: string;

  @IsEnum(ProductFulfillmentType)
  fulfillmentType!: ProductFulfillmentType;

  @IsOptional()
  @IsString()
  threePlId?: string;

  @IsString()
  sku!: string;

  @IsString()
  title!: string;

  @IsNumber()
  @Min(0)
  stockOwnerCost!: number;

  @IsNumber()
  @Min(0)
  buyPrice!: number;

  @IsNumber()
  @Min(0)
  sellPrice!: number;

  @IsInt()
  @Min(0)
  stockQuantity!: number;
}

export class UpdateStockDto {
  @IsInt()
  stockQuantity!: number;
}
