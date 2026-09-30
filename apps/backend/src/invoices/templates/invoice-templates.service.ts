import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import {
  DEFAULT_INVOICE_TEMPLATE_ID,
  INVOICE_TEMPLATE_COLOR_KEYS,
  InvoiceTemplateColors,
  InvoiceTemplateDto,
  InvoiceTemplateSnapshot,
  InvoiceTemplatesDto,
  MAX_CUSTOM_INVOICE_TEMPLATES,
  PREDEFINED_INVOICE_TEMPLATES,
  Role,
} from "@ebay-order-management/shared";
import { Company } from "../../database/models/company.model";
import { InvoiceTemplate } from "../../database/models/invoice-template.model";
import { StaffProfile } from "../../database/models/staff-profile.model";
import { readUpload } from "../../uploads/uploads.util";
import type { JwtPayload } from "../../auth/jwt.strategy";
import { renderTemplatedInvoicePdf } from "../invoice-pdf-templated";
import { PreviewInvoiceTemplateDto, SaveInvoiceTemplateDto } from "./invoice-template.dto";
import { sampleInvoice } from "./invoice-template-sample";

/**
 * Invoice templates: the five predefined ones (in code, shared) plus up to five custom ones per
 * company. Only the company Admin manages them; anyone who creates invoices can pick any of them,
 * and the backoffice can look (read-only).
 */
@Injectable()
export class InvoiceTemplatesService {
  constructor(
    @InjectModel(InvoiceTemplate) private readonly templateModel: typeof InvoiceTemplate,
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(StaffProfile) private readonly staffProfileModel: typeof StaffProfile,
  ) {}

  async list(companyId: string, requester: JwtPayload): Promise<InvoiceTemplatesDto> {
    await this.assertCanView(requester);
    const company = await this.findCompany(companyId);
    const custom = await this.templateModel.findAll({ where: { companyId }, order: [["createdAt", "ASC"]] });
    return {
      templates: [...PREDEFINED_INVOICE_TEMPLATES.map(predefinedDto), ...custom.map(customDto)],
      defaultTemplateId: await this.defaultId(company),
    };
  }

  async create(companyId: string, requester: JwtPayload, dto: SaveInvoiceTemplateDto) {
    this.assertAdmin(requester);
    const count = await this.templateModel.count({ where: { companyId } });
    if (count >= MAX_CUSTOM_INVOICE_TEMPLATES) {
      throw new BadRequestException(
        `You can save up to ${MAX_CUSTOM_INVOICE_TEMPLATES} custom templates — delete one to make room`,
      );
    }
    const template = await this.templateModel.create({
      companyId,
      name: dto.name.trim(),
      layout: dto.layout,
      colors: pickColors(dto.colors),
      logoUrl: null,
    });
    return customDto(template);
  }

  async update(companyId: string, requester: JwtPayload, id: string, dto: SaveInvoiceTemplateDto) {
    this.assertAdmin(requester);
    const template = await this.findCustom(companyId, id);
    template.name = dto.name.trim();
    template.layout = dto.layout;
    template.colors = pickColors(dto.colors);
    await template.save();
    return customDto(template);
  }

  /** Invoices already issued with it keep their frozen copy. A deleted default falls back to Classic. */
  async remove(companyId: string, requester: JwtPayload, id: string) {
    this.assertAdmin(requester);
    const template = await this.findCustom(companyId, id);
    await template.destroy();
    await this.companyModel.update(
      { defaultInvoiceTemplateId: null },
      { where: { id: companyId, defaultInvoiceTemplateId: id } },
    );
    return { id };
  }

  /** `logoUrl` null = go back to the company logo. */
  async setLogo(companyId: string, requester: JwtPayload, id: string, logoUrl: string | null) {
    this.assertAdmin(requester);
    const template = await this.findCustom(companyId, id);
    template.logoUrl = logoUrl;
    await template.save();
    return customDto(template);
  }

  async setDefault(companyId: string, requester: JwtPayload, templateId: string) {
    this.assertAdmin(requester);
    const company = await this.findCompany(companyId);
    await this.resolve(companyId, templateId);
    company.defaultInvoiceTemplateId = templateId === DEFAULT_INVOICE_TEMPLATE_ID ? null : templateId;
    await company.save();
    return { defaultTemplateId: templateId };
  }

  /**
   * The style to freeze on an invoice: the chosen template (or the company default), with the company
   * logo filled in when the template has none of its own.
   */
  async snapshot(companyId: string, templateId?: string): Promise<InvoiceTemplateSnapshot> {
    const company = await this.findCompany(companyId);
    const template = await this.resolve(companyId, templateId ?? (await this.defaultId(company)));
    return {
      templateId: template.id,
      name: template.name,
      layout: template.layout,
      colors: template.colors,
      logoUrl: template.logoUrl ?? company.logoUrl ?? null,
    };
  }

  /** The editor's live preview: sample invoice content drawn with unsaved layout/colors/logo. */
  async preview(companyId: string, requester: JwtPayload, dto: PreviewInvoiceTemplateDto, logoFile?: Express.Multer.File) {
    this.assertAdmin(requester);
    const company = await this.findCompany(companyId);
    const colors = parseColors(dto.colors);
    let logo: Buffer | null = null;
    if (dto.useCompanyLogo === "true") {
      logo = company.logoUrl ? await readUpload(company.logoUrl) : null;
    } else if (logoFile) {
      logo = logoFile.buffer;
    } else if (dto.templateId) {
      const saved = await this.templateModel.findOne({ where: { id: dto.templateId, companyId } });
      const url = saved?.logoUrl ?? company.logoUrl;
      logo = url ? await readUpload(url) : null;
    }
    const sample = sampleInvoice(dto.role);
    return renderTemplatedInvoicePdf({
      invoiceNumber: "SAMPLE-001",
      date: new Date(),
      status: "Unpaid",
      company: { name: company.name },
      partnerName: sample.partnerName,
      role: dto.role,
      currency: sample.currency,
      lines: sample.lines,
      totalAmount: sample.totalAmount,
      layout: dto.layout,
      colors,
      logo,
    });
  }

  // ---------------------------------------------------------------------------------------------

  /** A predefined or custom template by id; a custom one must belong to this company. */
  private async resolve(companyId: string, id: string): Promise<InvoiceTemplateDto> {
    const predefined = PREDEFINED_INVOICE_TEMPLATES.find((t) => t.id === id);
    if (predefined) return predefinedDto(predefined);
    const custom = isUuid(id) ? await this.templateModel.findOne({ where: { id, companyId } }) : null;
    if (!custom) throw new BadRequestException("That invoice template no longer exists — pick another one");
    return customDto(custom);
  }

  /** The stored default, or Classic when it's unset or points at a template that's gone. */
  private async defaultId(company: Company): Promise<string> {
    const id = company.defaultInvoiceTemplateId;
    if (!id) return DEFAULT_INVOICE_TEMPLATE_ID;
    if (PREDEFINED_INVOICE_TEMPLATES.some((t) => t.id === id)) return id;
    const exists = isUuid(id) && (await this.templateModel.count({ where: { id, companyId: company.id } })) > 0;
    return exists ? id : DEFAULT_INVOICE_TEMPLATE_ID;
  }

  private async findCustom(companyId: string, id: string) {
    const template = isUuid(id) ? await this.templateModel.findOne({ where: { id, companyId } }) : null;
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  private async findCompany(companyId: string) {
    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  /** Managing templates is the company Admin's job (the backoffice only looks). */
  private assertAdmin(requester: JwtPayload) {
    if (requester.realm !== "portal" || !requester.roles.includes(Role.ADMIN)) {
      throw new ForbiddenException("Only the company Admin can manage invoice templates");
    }
  }

  /** Backoffice, the Admin, and Staff who create invoices (they pick a template in the wizard). */
  private async assertCanView(requester: JwtPayload) {
    if (requester.realm === "backoffice" || requester.roles.includes(Role.ADMIN)) return;
    if (requester.roles.includes(Role.STAFF)) {
      const profile = await this.staffProfileModel.findByPk(requester.sub);
      if (profile?.canGenerateInvoices) return;
    }
    throw new ForbiddenException("You do not have permission to perform this action");
  }
}

function predefinedDto(t: (typeof PREDEFINED_INVOICE_TEMPLATES)[number]): InvoiceTemplateDto {
  return { id: t.id, name: t.name, layout: t.layout, colors: { ...t.colors }, logoUrl: null, predefined: true };
}

function customDto(t: InvoiceTemplate): InvoiceTemplateDto {
  return { id: t.id, name: t.name, layout: t.layout, colors: t.colors, logoUrl: t.logoUrl, predefined: false };
}

/** Only the five known keys, lower-cased — nothing else ends up in the JSONB column. */
function pickColors(colors: InvoiceTemplateColors): InvoiceTemplateColors {
  return Object.fromEntries(INVOICE_TEMPLATE_COLOR_KEYS.map((k) => [k, colors[k].toLowerCase()])) as unknown as InvoiceTemplateColors;
}

function parseColors(json: string): InvoiceTemplateColors {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException("Invalid colors");
  }
  const colors = parsed as Record<string, unknown>;
  const valid =
    !!colors &&
    typeof colors === "object" &&
    INVOICE_TEMPLATE_COLOR_KEYS.every((k) => typeof colors[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(colors[k] as string));
  if (!valid) throw new BadRequestException("Colors must be hex codes like #1e293b");
  return pickColors(colors as unknown as InvoiceTemplateColors);
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
