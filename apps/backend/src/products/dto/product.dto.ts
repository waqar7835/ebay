import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";
import { ProductFulfillmentType } from "@ebay-order-management/shared";

export class CreateProductDto {
  // Required for STOCK (tied to a Stock Owner); omitted entirely for DROPSHIP.
  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsString()
  stockOwnerId?: string;

  @IsEnum(ProductFulfillmentType)
  fulfillmentType!: ProductFulfillmentType;

  @IsOptional()
  @IsString()
  threePlId?: string;

  @IsString()
  sku!: string;

  @IsString()
  title!: string;

  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsNumber()
  @Min(0)
  stockOwnerCost?: number;

  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsNumber()
  @Min(0)
  buyPrice?: number;

  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsNumber()
  @Min(0)
  sellPrice?: number;

  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsInt()
  @Min(0)
  stockQuantity?: number;
}

export class UpdateStockDto {
  @IsInt()
  stockQuantity!: number;
}
