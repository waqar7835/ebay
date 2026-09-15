import { IsString } from "class-validator";

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class ResendVerificationDto {
  @IsString()
  email!: string;
}

export class VerifyEmailCodeDto {
  @IsString()
  email!: string;

  @IsString()
  code!: string;
}
