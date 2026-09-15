import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  name?: string;
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
