import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { ExchangeRate } from "../database/models/exchange-rate.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { ExchangeRatesController } from "./exchange-rates.controller";
import { ExchangeRatesService } from "./exchange-rates.service";

@Module({
  imports: [SequelizeModule.forFeature([ExchangeRate, StaffProfile, BackofficeStaffProfile])],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
