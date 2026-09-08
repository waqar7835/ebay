import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  companyName!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @MinLength(8)
  confirmPassword!: string;
}
