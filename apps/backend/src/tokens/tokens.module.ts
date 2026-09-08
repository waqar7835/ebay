import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { VerificationToken } from "../database/models/verification-token.model";
import { TokensService } from "./tokens.service";

@Module({
  imports: [SequelizeModule.forFeature([VerificationToken])],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
