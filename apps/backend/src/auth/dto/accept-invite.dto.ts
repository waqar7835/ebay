import { IsString, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @MinLength(8)
  password!: string;

  @MinLength(8)
  confirmPassword!: string;
}
