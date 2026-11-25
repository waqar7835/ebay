import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { AccountHolderAdvance } from "../database/models/account-holder-advance.model";
import { AccountHolderAdvanceUsage } from "../database/models/account-holder-advance-usage.model";
import { User } from "../database/models/user.model";
import { AdvancesController } from "./advances.controller";
import { AdvancesService } from "./advances.service";

@Module({
  imports: [SequelizeModule.forFeature([AccountHolderAdvance, AccountHolderAdvanceUsage, User])],
  controllers: [AdvancesController],
  providers: [AdvancesService],
  exports: [AdvancesService],
})
export class AdvancesModule {}
