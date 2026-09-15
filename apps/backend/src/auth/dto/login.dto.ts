import { IsEmail, IsIn, IsOptional, MinLength } from "class-validator";
import { PORTAL_ROLES, Role } from "@ebay-order-management/shared";

export type LoginContext = "backoffice" | "portal";

export class LoginDto {
  @IsEmail()
  email!: string;

  @MinLength(1)
  password!: string;

  @IsIn(["backoffice", "portal"])
  context!: LoginContext;

  // Portal only: a person can hold a separate account per role under the same email, so the
  // user type picks which of those accounts to sign into.
  @IsOptional()
  @IsIn(PORTAL_ROLES)
  role?: Role;
}
