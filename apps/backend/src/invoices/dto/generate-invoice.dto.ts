import { IsEnum, IsString } from "class-validator";
import { Role } from "@ebay-order-management/shared";

export class GenerateInvoiceDto {
  @IsString()
  userId!: string;

  @IsEnum(Role)
  role!: Role;
}
