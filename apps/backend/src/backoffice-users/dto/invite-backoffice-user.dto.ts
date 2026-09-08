import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, ValidateNested } from "class-validator";

export class BackofficePermissionsInput {
  @IsBoolean() canManageOrders!: boolean;
  @IsBoolean() canManageStock!: boolean;
  @IsBoolean() canManageUsers!: boolean;
  @IsBoolean() canGenerateInvoices!: boolean;
  @IsBoolean() canViewFinancials!: boolean;
}

export class InviteBackofficeUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  email!: string;

  @ValidateNested()
  @Type(() => BackofficePermissionsInput)
  permissions!: BackofficePermissionsInput;
}
