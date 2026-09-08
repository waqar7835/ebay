import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    this.from = this.config.get<string>("MAIL_FROM") ?? "no-reply@example.com";

    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(this.config.get<string>("SMTP_PORT") ?? 587),
          auth: {
            user: this.config.get<string>("SMTP_USER"),
            pass: this.config.get<string>("SMTP_PASS"),
          },
        })
      : null;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[dev email] to=${to} subject="${subject}"\n${html}`);
      return;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }
}
