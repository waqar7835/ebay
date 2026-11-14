import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { SequelizeModule } from "@nestjs/sequelize";
import { Company } from "../database/models/company.model";
import { User } from "../database/models/user.model";
import { UserRoleAssignment } from "../database/models/user-role.model";
import { BackofficeUser } from "../database/models/backoffice-user.model";
import { StaffProfile } from "../database/models/staff-profile.model";
import { BackofficeStaffProfile } from "../database/models/backoffice-staff-profile.model";
import { TokensModule } from "../tokens/tokens.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { jwtSecret } from "../common/jwt-secret.util";
import { RateLimitService } from "../common/rate-limit.service";

@Module({
  imports: [
    SequelizeModule.forFeature([Company, User, UserRoleAssignment, StaffProfile, BackofficeUser, BackofficeStaffProfile]),
    TokensModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN") ?? "1d" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
