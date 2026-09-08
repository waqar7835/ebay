import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { BackofficeUser } from "../database/models/backoffice-user.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { TokensModule } from "../tokens/tokens.module";
import { BackofficeUsersController } from "./backoffice-users.controller";
import { BackofficeUsersService } from "./backoffice-users.service";

@Module({
  imports: [SequelizeModule.forFeature([BackofficeUser, BackofficeStaffProfile]), TokensModule],
  controllers: [BackofficeUsersController],
  providers: [BackofficeUsersService],
  exports: [BackofficeUsersService],
})
export class BackofficeUsersModule {}
