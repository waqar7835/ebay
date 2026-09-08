import { IsEmail, IsString, MinLength } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @MinLength(8)
  password!: string;

  @MinLength(8)
  confirmPassword!: string;
}
