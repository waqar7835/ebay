import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import type { PlatformSettingsDto, PublicSiteDto } from "@ebay-order-management/shared";
import { PlatformSetting } from "../database/models/platform-setting.model";
import { decryptSecret, encryptSecret } from "../common/secret-box.util";
import { UpdatePlatformSettingsDto } from "./platform-settings.dto";

const SETTINGS_ID = 1;
const CACHE_MS = 30_000;

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
}

/**
 * Platform-wide settings (single row). Read on every email send and public-site request, so the row is cached
 * briefly in memory and refreshed on update.
 */
@Injectable()
export class PlatformSettingsService {
  private cached: { row: PlatformSetting; at: number } | null = null;

  constructor(@InjectModel(PlatformSetting) private readonly model: typeof PlatformSetting) {}

  private async row(): Promise<PlatformSetting> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.row;
    const [row] = await this.model.findOrCreate({ where: { id: SETTINGS_ID }, defaults: { id: SETTINGS_ID, brandName: "OrderSplit" } });
    this.cached = { row, at: Date.now() };
    return row;
  }

  async publicSite(): Promise<PublicSiteDto> {
    const r = await this.row();
    return {
      brandName: r.brandName,
      logoUrl: r.logoUrl,
      helloEmail: r.helloEmail,
      supportEmail: r.supportEmail,
      replyHours: r.replyHours ?? [],
      replyTimezone: r.replyTimezone,
    };
  }

  async get(): Promise<PlatformSettingsDto> {
    const r = await this.row();
    return {
      ...(await this.publicSite()),
      contactEmail: r.contactEmail,
      smtpHost: r.smtpHost,
      smtpPort: r.smtpPort,
      smtpSecure: r.smtpSecure,
      smtpUser: r.smtpUser,
      smtpPasswordSet: Boolean(r.smtpPasswordEncrypted),
      mailFromName: r.mailFromName,
      mailFromEmail: r.mailFromEmail,
      emailDelivery: r.smtpHost ? "smtp" : "log",
    };
  }

  async update(dto: UpdatePlatformSettingsDto): Promise<PlatformSettingsDto> {
    const r = await this.row();
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const patch: Partial<PlatformSetting> = {
      brandName: dto.brandName.trim(),
      helloEmail: clean(dto.helloEmail),
      supportEmail: clean(dto.supportEmail),
      contactEmail: clean(dto.contactEmail),
      replyHours: dto.replyHours.map((h) => ({ days: h.days.trim(), hours: h.hours.trim() })),
      replyTimezone: clean(dto.replyTimezone),
      smtpHost: clean(dto.smtpHost),
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure,
      smtpUser: clean(dto.smtpUser),
      mailFromName: clean(dto.mailFromName),
      mailFromEmail: clean(dto.mailFromEmail),
    };
    if (dto.clearSmtpPassword) patch.smtpPasswordEncrypted = null;
    else if (dto.smtpPassword) patch.smtpPasswordEncrypted = encryptSecret(dto.smtpPassword);
    await r.update(patch);
    this.cached = null;
    return this.get();
  }

  async setLogo(logoUrl: string | null): Promise<PlatformSettingsDto> {
    const r = await this.row();
    await r.update({ logoUrl });
    this.cached = null;
    return this.get();
  }

  async contactEmail(): Promise<string | null> {
    return (await this.row()).contactEmail;
  }

  /** null when no SMTP host is configured (emails are then only logged). */
  async smtp(): Promise<SmtpConfig | null> {
    const r = await this.row();
    if (!r.smtpHost) return null;
    const fromEmail = r.mailFromEmail ?? r.smtpUser ?? "no-reply@localhost";
    const fromName = (r.mailFromName ?? r.brandName).replace(/"/g, "");
    return {
      host: r.smtpHost,
      port: r.smtpPort,
      secure: r.smtpSecure,
      user: r.smtpUser,
      password: decryptSecret(r.smtpPasswordEncrypted),
      from: `"${fromName}" <${fromEmail}>`,
    };
  }
}
