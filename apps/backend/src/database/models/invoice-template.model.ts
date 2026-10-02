import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { InvoiceLayout, InvoiceTemplateColors, InvoiceWatermark } from "@ebay-order-management/shared";
import { Company } from "./company.model";

/**
 * A company's custom invoice template, or (with `predefinedKey` set) its edits to one of the
 * predefined templates, which otherwise live in code.
 */
@Table({ tableName: "invoice_templates", underscored: true })
export class InvoiceTemplate extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false, field: "company_id" })
  declare companyId: string;

  @BelongsTo(() => Company)
  declare company: Company;

  @Column({ type: DataType.STRING(60), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare layout: InvoiceLayout;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare colors: InvoiceTemplateColors;

  /** null = the company logo is used. */
  @Column({ type: DataType.STRING, allowNull: true, field: "logo_url" })
  declare logoUrl: string | null;

  /** null = no watermark set up. */
  @Column({ type: DataType.JSONB, allowNull: true })
  declare watermark: InvoiceWatermark | null;

  /** Set = this row is the company's edit of that predefined template ("classic", …); null = custom. */
  @Column({ type: DataType.STRING(16), allowNull: true, field: "predefined_key" })
  declare predefinedKey: string | null;
}
