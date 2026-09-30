import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { InvoiceLayout, InvoiceTemplateColors } from "@ebay-order-management/shared";
import { Company } from "./company.model";

/** A company's custom invoice template (the predefined ones live in code, not here). */
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
}
