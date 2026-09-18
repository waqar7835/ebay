import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { ProductFulfillmentType, Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";

export class StaffPermissionsInput {
  @IsBoolean() canManageOrders!: boolean;
  @IsBoolean() canManageStock!: boolean;
  @IsBoolean() canManageUsers!: boolean;
  @IsBoolean() canGenerateInvoices!: boolean;
  @IsBoolean() canViewFinancials!: boolean;
  @IsBoolean() hasRevenueShare!: boolean;
  @IsOptional() @IsNumber() sharePercent?: number;
}

export class AccountHolderProfileInput {
  @IsNumber() sharePercent!: number;
  @IsOptional() @IsNumber() threePlPriceCharged?: number;
  @IsInt() @Min(1) @Max(28) billingCycleStartDay!: number;
}

export class StockOwnerProfileInput {
  @IsEnum(StockOwnerPayoutMode) payoutMode!: StockOwnerPayoutMode;
  @IsOptional() @IsNumber() sharePercent?: number;
  @IsInt() @Min(1) @Max(28) billingCycleStartDay!: number;
}

export class ThreePlProfileInput {
  @IsNumber() payoutPerOrder!: number;
  @IsInt() @Min(1) @Max(28) billingCycleStartDay!: number;
  @IsEnum(ProductFulfillmentType) fulfillmentType!: ProductFulfillmentType;
}

export class InviteUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  email!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(Role, { each: true })
  roles!: Role[];

  @IsOptional()
  @ValidateNested()
  @Type(() => StaffPermissionsInput)
  staffPermissions?: StaffPermissionsInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountHolderProfileInput)
  accountHolderProfile?: AccountHolderProfileInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => StockOwnerProfileInput)
  stockOwnerProfile?: StockOwnerProfileInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThreePlProfileInput)
  threePlProfile?: ThreePlProfileInput;
}
