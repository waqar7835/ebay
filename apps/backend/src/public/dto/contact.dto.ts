import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ContactTopic } from "@ebay-order-management/shared";

export class ContactMessageDto {
  @IsEnum(ContactTopic)
  topic!: ContactTopic;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  role!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  message!: string;

  /** Honeypot: a hidden field real visitors never fill in. Anything here means a bot. */
  @IsOptional()
  @IsString()
  website?: string;
}
