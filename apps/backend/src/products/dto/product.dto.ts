import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf, ValidateNested } from "class-validator";
import { ProductFulfillmentType } from "@ebay-order-management/shared";

/**
 * One variation of a product (e.g. a color / size). Title, type, Stock Owner and 3PL come from the main product;
 * prices and stock only apply to STOCK products.
 */
export class ProductVariationDto {
  // Existing variation of this product to update; omitted for a new one.
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockOwnerCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;
}

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

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

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

  /**
   * The product's whole list of variations, in order: entries with an `id` update that variation, the rest are
   * created, and variations left out are deleted (refused while one is on an order). Omit to leave them as they are.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariationDto)
  variations?: ProductVariationDto[];
}

export class SetProductImagesDto {
  // JSON-encoded string[] (multipart bodies can't carry arrays natively) — see ProductsController.setImages.
  @IsString()
  layout!: string;
}

export class UpdateStockDto {
  @IsInt()
  stockQuantity!: number;
}

// Full replacement: the edit form resubmits every field, validated by the same rules as create.
export class UpdateProductDto extends CreateProductDto {}
