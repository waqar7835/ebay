import { IsEmail, IsIn, MinLength } from "class-validator";

export type LoginContext = "backoffice" | "portal";

export class LoginDto {
  @IsEmail()
  email!: string;

  @MinLength(1)
  password!: string;

  @IsIn(["backoffice", "portal"])
  context!: LoginContext;
}
