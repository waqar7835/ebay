import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  imports: [SubscriptionsModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
