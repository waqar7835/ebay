import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class ReplyHoursRowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  days!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  hours!: string;
}

/** Empty strings are sent as null by the backoffice; `ValidateIf` skips format checks for null. */
export class UpdatePlatformSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  brandName!: string;

  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  helloEmail!: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  supportEmail!: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  contactEmail!: string | null;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReplyHoursRowDto)
  replyHours!: ReplyHoursRowDto[];

  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  replyTimezone!: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  smtpHost!: string | null;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @IsBoolean()
  smtpSecure!: boolean;

  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  smtpUser!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPassword?: string;

  @IsOptional()
  @IsBoolean()
  clearSmtpPassword?: boolean;

  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  mailFromName!: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  mailFromEmail!: string | null;
}

export class TestEmailDto {
  @IsEmail()
  to!: string;
}
