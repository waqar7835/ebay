import { Type } from "class-transformer";
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { InvoiceLayout, Role } from "@ebay-order-management/shared";

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

/** Create or replace a custom template's name, layout and colors (the logo is uploaded separately). */
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
