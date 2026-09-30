import { IsEnum } from "class-validator";
import { Currency } from "@ebay-order-management/shared";

export class UpdateCompanyDefaultCurrencyDto {
  @IsEnum(Currency)
  defaultCurrency!: Currency;
}
