import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf, ValidateNested } from "class-validator";
import { ProductFulfillmentType } from "@ebay-order-management/shared";

/** Units of a STOCK product held at one 3PL. Not limited to ≥ 0: orders may take stock below zero. */
export class ProductStockInputDto {
  @IsUUID()
  threePlId!: string;

  @IsInt()
  quantity!: number;
}

/**
 * One variation of a product (e.g. a color / size). Title, type, Stock Owner and the list of 3PLs come from the main
 * product; prices and stock only apply to STOCK products.
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

  /**
   * Its quantity at each of the main product's 3PLs. A 3PL left out keeps the variation's current quantity there (0 when
   * new); 3PLs that aren't on the main product are refused.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductStockInputDto)
  stocks?: ProductStockInputDto[];
}

export class CreateProductDto {
  // Required for STOCK (tied to a Stock Owner); omitted entirely for DROPSHIP.
  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsString()
  stockOwnerId?: string;

  @IsEnum(ProductFulfillmentType)
  fulfillmentType!: ProductFulfillmentType;

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

  /** STOCK: the 3PLs holding the product (at least one, each once) and the units at each. Not sent for DROPSHIP. */
  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductStockInputDto)
  stocks?: ProductStockInputDto[];

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

/** Sets the units of a product at one of its 3PLs. */
export class UpdateStockDto {
  @IsUUID()
  threePlId!: string;

  @IsInt()
  stockQuantity!: number;
}

// Full replacement: the edit form resubmits every field, validated by the same rules as create.
export class UpdateProductDto extends CreateProductDto {}
