import { IsNumber, IsOptional, IsString, Matches, MaxLength, Max, Min } from "class-validator";

/** One advance deposit, in the Account Holder's currency. */
export class AdvanceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: "The amount must be more than 0" })
  @Max(9_999_999_999)
  amount!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Pick the date the advance was received" })
  depositDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
