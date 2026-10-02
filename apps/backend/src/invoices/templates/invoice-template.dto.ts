import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { INVOICE_WATERMARK_LIMITS as LIMITS, InvoiceLayout, Role } from "@ebay-order-management/shared";

const HEX = /^#[0-9a-fA-F]{6}$/;
const HEX_MESSAGE = "Colors must be hex codes like #1e293b";

export class InvoiceTemplateColorsDto {
  @Matches(HEX, { message: HEX_MESSAGE })
  background!: string;

  @Matches(HEX, { message: HEX_MESSAGE })
  accent!: string;

  @Matches(HEX, { message: HEX_MESSAGE })
  headingText!: string;

  @Matches(HEX, { message: HEX_MESSAGE })
  text!: string;

  @Matches(HEX, { message: HEX_MESSAGE })
  border!: string;
}

export class InvoiceWatermarkDto {
  @IsBoolean()
  enabled!: boolean;

  /** Only required while the watermark is on. */
  @IsString()
  @ValidateIf((o: InvoiceWatermarkDto) => o.enabled)
  @IsNotEmpty({ message: "Enter the watermark text" })
  @MaxLength(LIMITS.text)
  text!: string;

  @Matches(HEX, { message: "Watermark color must be a hex code like #94a3b8" })
  color!: string;

  @IsInt()
  @Min(LIMITS.size.min)
  @Max(LIMITS.size.max)
  size!: number;

  @IsInt()
  @Min(LIMITS.opacity.min)
  @Max(LIMITS.opacity.max)
  opacity!: number;

  @IsInt()
  @Min(LIMITS.rotation.min)
  @Max(LIMITS.rotation.max)
  rotation!: number;

  @IsBoolean()
  repeat!: boolean;

  @IsInt()
  @Min(LIMITS.gap.min)
  @Max(LIMITS.gap.max)
  gapX!: number;

  @IsInt()
  @Min(LIMITS.gap.min)
  @Max(LIMITS.gap.max)
  gapY!: number;
}

/**
 * Create or replace a template's name, layout, colors and watermark (the logo is uploaded separately).
 * On a predefined template the name and layout are fixed and ignored.
 */
export class SaveInvoiceTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsEnum(InvoiceLayout)
  layout!: InvoiceLayout;

  @ValidateNested()
  @Type(() => InvoiceTemplateColorsDto)
  colors!: InvoiceTemplateColorsDto;

  /** Omitted = no watermark. */
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceWatermarkDto)
  watermark?: InvoiceWatermarkDto | null;
}

export class SetDefaultInvoiceTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  templateId!: string;
}

/**
 * The editor's live preview. Sent as multipart form fields (so an unsaved logo can come along as the
 * `logo` file), hence `colors` is a JSON string.
 */
export class PreviewInvoiceTemplateDto {
  @IsEnum(InvoiceLayout)
  layout!: InvoiceLayout;

  @IsString()
  colors!: string;

  /** JSON of an `InvoiceWatermark`; omitted = none. */
  @IsOptional()
  @IsString()
  watermark?: string;

  @IsIn([Role.ACCOUNT_HOLDER, Role.STOCK_OWNER, Role.THREE_PL])
  role!: Role.ACCOUNT_HOLDER | Role.STOCK_OWNER | Role.THREE_PL;

  /** "true" = draw with the company logo; otherwise the uploaded file, else this template's saved logo. */
  @IsIn(["true", "false"])
  useCompanyLogo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;
}
