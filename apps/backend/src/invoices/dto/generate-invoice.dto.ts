import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { Role } from "@ebay-order-management/shared";

export class GenerateInvoiceDto {
  @IsString()
  userId!: string;

  @IsEnum(Role)
  role!: Role;

  /** Start date of the billing cycle to invoice (current or any previous one); defaults to the current cycle. */
  @IsOptional()
  @IsDateString()
  periodStart?: string;
}
