import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  companyName!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  @Matches(/[A-Za-z]/, { message: "Password must contain at least 1 letter" })
  @Matches(/\d/, { message: "Password must contain at least 1 number" })
  password!: string;

  @MinLength(8)
  confirmPassword!: string;
}
