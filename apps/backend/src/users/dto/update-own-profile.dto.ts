import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { Currency } from "@ebay-order-management/shared";

export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  name?: string;
}

/** What a manager may change on another user. Currency changes apply to new orders only. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsString()
  confirmNewPassword!: string;
}
