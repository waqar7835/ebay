import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { InvoiceRole, Role } from "@ebay-order-management/shared";

export const INVOICE_ROLES = [Role.ACCOUNT_HOLDER, Role.STOCK_OWNER, Role.THREE_PL] as const;

export class InvoiceMiscLineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** PKR; negative deducts from the payout. */
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;
}

/** The wizard's selection — used both to preview the PDF and to create the invoice. */
export class InvoiceDraftDto {
  @IsUUID()
  userId!: string;

  @IsIn(INVOICE_ROLES)
  role!: InvoiceRole;

  @IsArray()
  @IsUUID("all", { each: true })
  orderIds!: string[];

  /** Invoiced orders since refunded — each adds a negative adjustment. */
  @IsArray()
  @IsUUID("all", { each: true })
  refundOrderIds!: string[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceMiscLineDto)
  miscLines!: InvoiceMiscLineDto[];
}
