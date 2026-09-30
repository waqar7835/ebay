import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SubscriptionsService } from "./subscriptions.service";

@Injectable()
export class SubscriptionsScheduler {
  private readonly logger = new Logger(SubscriptionsScheduler.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  /** Expiry reminders (5 days and 1 day before) and expiring lapsed plans. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sweep() {
    await this.subscriptions.sweep();
    this.logger.log("Subscription sweep done");
  }

  /** Also just after midnight, so a lapsed plan's accounts don't keep working until 9am. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async midnightSweep() {
    await this.subscriptions.sweep();
  }
}
