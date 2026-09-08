import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import { SeatBilling } from "../database/models/seat-billing.model";
import { SeatPaymentOrder, SeatPaymentOrderStatus } from "../database/models/seat-payment-order.model";
import { SeatPaymentOrderItem } from "../database/models/seat-payment-order-item.model";
import { User } from "../database/models/user.model";
import { Company } from "../database/models/company.model";
import { MailerService } from "../mailer/mailer.service";
import { daysBetween } from "./billing-date.util";

@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(
    @InjectModel(SeatBilling) private readonly seatBillingModel: typeof SeatBilling,
    @InjectModel(SeatPaymentOrderItem) private readonly orderItemModel: typeof SeatPaymentOrderItem,
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(Company) private readonly companyModel: typeof Company,
    private readonly mailer: MailerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sweep() {
    const today = new Date();
    const overdue = await this.seatBillingModel.findAll({
      where: { blocked: false, paidThroughDate: { [Op.lt]: today } },
    });

    for (const billing of overdue) {
      await this.processOverdueSeat(billing, today);
    }

    this.logger.log(`Billing sweep processed ${overdue.length} overdue seat(s)`);
  }

  private async processOverdueSeat(billing: SeatBilling, today: Date) {
    const hasPendingOrder = await this.orderItemModel.count({
      where: { userId: billing.userId },
      include: [
        {
          model: SeatPaymentOrder,
          where: { status: SeatPaymentOrderStatus.SUBMITTED },
          required: true,
        },
      ],
    });
    if (hasPendingOrder > 0) {
      return; // Grace period while a payment order is under review.
    }

    const dueDate = new Date(billing.paidThroughDate as unknown as string);
    const daysOverdue = daysBetween(dueDate, today);

    if (daysOverdue >= 15) {
      billing.blocked = true;
      await billing.save();
      await this.notify(billing, "Account blocked: seat payment overdue", true);
      return;
    }

    const milestoneReached = daysOverdue >= 10 ? 10 : daysOverdue >= 5 ? 5 : null;
    if (milestoneReached && billing.remindersSentCount < milestoneReached / 5) {
      billing.remindersSentCount += 1;
      billing.lastReminderSentAt = today;
      await billing.save();
      await this.notify(billing, "Reminder: seat payment overdue", milestoneReached === 10);
    }
  }

  private async notify(billing: SeatBilling, subject: string, finalWarning: boolean) {
    const user = await this.userModel.findByPk(billing.userId);
    if (!user) return;

    const body = finalWarning
      ? `<p>Your company's account will be blocked for non-payment if this is not resolved soon.</p>`
      : `<p>A seat payment is overdue. Please submit payment to avoid interruption.</p>`;

    await this.mailer.send(user.email, subject, body);

    if (user.companyId) {
      const company = await this.companyModel.findByPk(user.companyId);
      const admin = company ? await this.userModel.findOne({ where: { companyId: company.id } }) : null;
      if (admin) {
        await this.mailer.send(admin.email, `${subject} (${user.email})`, body);
      }
    }
  }
}
