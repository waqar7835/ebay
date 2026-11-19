import { ArrayMaxSize, IsArray, IsBoolean, IsUUID } from "class-validator";

/** The Account Holder's owned products (main products of its linked Stock Owner account) and the auto-add switch. */
export class OwnedProductsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID("all", { each: true })
  productIds!: string[];

  @IsBoolean()
  autoAddOwnedProducts!: boolean;
}
