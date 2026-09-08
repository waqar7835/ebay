import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsPositive, IsString, ValidateNested } from "class-validator";

export class SeatOrderItemDto {
  @IsString()
  userId!: string;

  @IsInt()
  @IsPositive()
  months!: number;
}

export class SubmitSeatOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeatOrderItemDto)
  items!: SeatOrderItemDto[];

  @IsOptional()
  @IsString()
  referenceNote?: string;
}

export class ReviewSeatOrderDto {
  approve!: boolean;
}
