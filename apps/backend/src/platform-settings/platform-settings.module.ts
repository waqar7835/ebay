import { Global, Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { PlatformSetting } from "../database/models/platform-setting.model";
import { PlatformSettingsController } from "./platform-settings.controller";
import { PlatformSettingsService } from "./platform-settings.service";

/** Global so the mailer and the public endpoints can read settings without importing this module. */
@Global()
@Module({
  imports: [SequelizeModule.forFeature([PlatformSetting])],
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
