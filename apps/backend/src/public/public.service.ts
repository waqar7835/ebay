import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ContactTopic, type PublicPricingDto, type PublicSiteDto } from "@ebay-order-management/shared";
import { MailerService } from "../mailer/mailer.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { ContactMessageDto } from "./dto/contact.dto";

const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_MS = 10 * 60 * 1000;

const TOPIC_LABELS: Record<ContactTopic, string> = {
  SALES: "Sales",
  SUPPORT: "Support",
  BILLING: "Billing",
  OTHER: "Other",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Endpoints for the logged-out marketing site: live pricing and the contact form. */
@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);
  /** In-memory per-IP send log for the contact form; good enough for one instance pre-launch. */
  private readonly contactLog = new Map<string, number[]>();

  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly mailer: MailerService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async pricing(): Promise<PublicPricingDto> {
    const [plans, periods] = await Promise.all([this.subscriptions.listPlans(false), this.subscriptions.listPeriods(false)]);
    return {
      plans: plans.map((p) => p.toJSON()),
      periods: periods.map((p) => p.toJSON()),
    };
  }

  site(): Promise<PublicSiteDto> {
    return this.settings.publicSite();
  }

  async contact(dto: ContactMessageDto, ip: string): Promise<{ message: string }> {
    const ok = { message: "Message sent" };
    if (dto.website) {
      this.logger.warn(`Contact form honeypot filled from ${ip}; dropped`);
      return ok;
    }
    this.assertUnderLimit(ip);

    const to = await this.settings.contactEmail();

    const rows: Array<[string, string]> = [
      ["Topic", TOPIC_LABELS[dto.topic]],
      ["Name", dto.name],
      ["Email", dto.email],
      ["Company", dto.company?.trim() || "—"],
      ["I am a", dto.role],
    ];
    const html = `
      <h2>New contact message</h2>
      <table cellpadding="6">${rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
      <p style="white-space:pre-wrap">${escapeHtml(dto.message)}</p>
      <p style="color:#6b7086">Reply directly to ${escapeHtml(dto.email)}.</p>`;
    const subject = `[${TOPIC_LABELS[dto.topic]}] ${dto.name}`;
    if (!to) {
      this.logger.warn(`No contact email is set in the backoffice settings; message only logged: ${subject}\n${html}`);
      return ok;
    }
    await this.mailer.send(to, subject, html);
    return ok;
  }

  private assertUnderLimit(ip: string) {
    const now = Date.now();
    const recent = (this.contactLog.get(ip) ?? []).filter((t) => now - t < CONTACT_WINDOW_MS);
    if (recent.length >= CONTACT_LIMIT) {
      throw new HttpException("Too many messages. Please wait a few minutes and try again.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.contactLog.set(ip, recent);
  }
}
