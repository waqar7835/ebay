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
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Currency, ProductFulfillmentType, Role, StockOwnerPayoutMode } from "@ebay-order-management/shared";

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
  // Required for STOCK 3PLs; omitted for DROPSHIP 3PLs, who are instead paid the buy price they
  // enter per order (see OrdersService.setDropshipBuyPrice).
  @ValidateIf((o) => o.fulfillmentType === ProductFulfillmentType.STOCK)
  @IsNumber()
  payoutPerOrder?: number;
  @IsInt() @Min(1) @Max(28) billingCycleStartDay!: number;
  @IsEnum(ProductFulfillmentType) fulfillmentType!: ProductFulfillmentType;
  /** Auto-mark this 3PL's shipped orders DELIVERED after `deliveryDays` (required when on). Omitted = off. */
  @IsOptional() @IsBoolean() autoDeliveryEnabled?: boolean;
  @ValidateIf((o) => o.autoDeliveryEnabled === true)
  @IsInt()
  @Min(1)
  @Max(365)
  deliveryDays?: number | null;
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

  /** Currency the user's amounts are entered in (Account Holder / Stock Owner / 3PL). Defaults to GBP. */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

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
