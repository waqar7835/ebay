import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [SequelizeModule.forFeature([Company])],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
