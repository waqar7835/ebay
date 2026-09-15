import { IsIn } from "class-validator";

export const BILLING_ANCHOR_DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 30] as const;

export class UpdateCompanyBillingAnchorDayDto {
  @IsIn(BILLING_ANCHOR_DAY_OPTIONS)
  billingAnchorDay!: number;
}
