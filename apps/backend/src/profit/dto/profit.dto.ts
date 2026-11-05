import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ExpenseChargedTo } from "@ebay-order-management/shared";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class PartnerPercentInput {
  @IsUUID() userId!: string;
  @IsNumber() @Min(0) @Max(100) percent!: number;
}

export class ProfitSplitSettingsInputDto {
  @IsNumber() @Min(0) @Max(100) adminPercent!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerPercentInput)
  partners!: PartnerPercentInput[];

  @IsOptional() @IsNumber() openingBalance!: number | null;

  @IsOptional() @Matches(DATE_ONLY, { message: "openingCycleStart must be a YYYY-MM-DD date" }) openingCycleStart!: string | null;
}

export class GenerateProfitStatementDto {
  @Matches(DATE_ONLY, { message: "cycleStart must be a YYYY-MM-DD date" }) cycleStart!: string;
}

export class ExpenseInputDto {
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsNumber() @Min(0.01, { message: "Amount must be more than 0" }) amount!: number;
  @Matches(DATE_ONLY, { message: "expenseDate must be a YYYY-MM-DD date" }) expenseDate!: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @IsEnum(ExpenseChargedTo) chargedTo!: ExpenseChargedTo;
  @IsOptional() @IsUUID() chargedToUserId?: string | null;
}

export class ExpenseCategoryInputDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
}
