import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PlatformSettingsService, type SmtpConfig } from "../platform-settings/platform-settings.service";

/**
 * Sends email with the SMTP settings the Super Admin saved in the backoffice (platform_settings). With no SMTP host
 * saved, emails are written to the log instead, which is how local development works.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transport: { key: string; transporter: nodemailer.Transporter } | null = null;

  constructor(private readonly settings: PlatformSettingsService) {}

  private transporterFor(smtp: SmtpConfig): nodemailer.Transporter {
    const key = JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.user, smtp.password]);
    if (this.transport?.key !== key) {
      this.transport = {
        key,
        transporter: nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? "" } : undefined,
        }),
      };
    }
    return this.transport.transporter;
  }

  /** Best-effort: a delivery failure is logged and doesn't fail the request that triggered the email. */
  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.deliver(to, subject, html);
    } catch (err) {
      this.logger.error(`Failed to send email to=${to} subject="${subject}": ${(err as Error).message}`);
    }
  }

  /** Same as send() but surfaces SMTP errors; used by the backoffice "Send test email" button. */
  async sendOrThrow(to: string, subject: string, html: string): Promise<void> {
    const smtp = await this.settings.smtp();
    if (!smtp) throw new BadRequestException("No SMTP server is saved yet, so emails are only written to the server log");
    try {
      await this.deliver(to, subject, html);
    } catch (err) {
      throw new BadRequestException(`The SMTP server refused the email: ${(err as Error).message}`);
    }
  }

  private async deliver(to: string, subject: string, html: string): Promise<void> {
    const smtp = await this.settings.smtp();
    if (!smtp) {
      this.logger.log(`[dev email] to=${to} subject="${subject}"\n${html}`);
      return;
    }
    await this.transporterFor(smtp).sendMail({ from: smtp.from, to, subject, html });
  }
}
