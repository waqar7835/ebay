import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min, MinLength } from "class-validator";

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsNumber()
  @Min(0)
  pricePerMonth!: number;

  @IsInt()
  @Min(0)
  maxAccountHolders!: number;

  @IsInt()
  @Min(0)
  maxStockOwners!: number;

  @IsInt()
  @Min(0)
  maxThreePls!: number;

  @IsInt()
  @Min(0)
  maxStaff!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAccountHolders?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxStockOwners?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxThreePls?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxStaff?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class BillingPeriodDto {
  @IsInt()
  @Min(1)
  @Max(60)
  months!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBillingPeriodDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Multipart form fields — numbers/uuids arrive as strings. */
export class SubmitSubscriptionPaymentDto {
  @IsUUID()
  planId!: string;

  @IsUUID()
  billingPeriodId!: string;

  @IsOptional()
  @IsString()
  referenceNote?: string;
}

export class ReviewSubscriptionPaymentDto {
  @IsBoolean()
  approve!: boolean;
}

/** Super Admin puts a company on a plan directly (e.g. an offline deal), without a payment. */
export class AssignPlanDto {
  @IsUUID()
  planId!: string;

  /** Last day (inclusive) of the plan; ignored for the free plan. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsAt?: string;
}
