import { IsString, MinLength } from "class-validator";

export class UpdateCompanyNameDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
