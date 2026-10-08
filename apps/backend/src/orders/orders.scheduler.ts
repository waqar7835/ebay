import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrdersService } from "./orders.service";

@Injectable()
export class OrdersScheduler {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(private readonly orders: OrdersService) {}

  /** 3PL auto-delivery: hourly, so an order is marked DELIVERED within the hour its delivery days run out. */
  @Cron(CronExpression.EVERY_HOUR)
  async autoDeliver() {
    try {
      const delivered = await this.orders.autoDeliver();
      if (delivered) this.logger.log(`Auto-delivered ${delivered} order(s)`);
    } catch (err) {
      this.logger.error("Auto-delivery failed", err instanceof Error ? err.stack : String(err));
    }
  }
}
