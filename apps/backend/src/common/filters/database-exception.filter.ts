import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { BaseError, DatabaseError, ForeignKeyConstraintError, UniqueConstraintError, ValidationError } from "sequelize";

/** Friendly messages for the unique constraints/indexes we know about, by constraint name. */
const UNIQUE_MESSAGES: Record<string, string> = {
  products_company_id_sku_unique: "A product with this SKU already exists in your company. Use a different SKU.",
  orders_company_id_ebay_order_ref_unique: "This eBay order number is already used by another order.",
  user_roles_user_id_role_unique: "This user already has that role.",
  invoices_company_sequence_unique: "Another invoice was created at the same time. Please try again.",
  invoice_templates_company_predefined_key: "This template was already customised. Refresh the page and try again.",
  subscription_billing_periods_months_key: "A billing duration with this number of months already exists.",
  backoffice_users_email_key: "An account with this email already exists.",
};

const FIELD_LABELS: Record<string, string> = {
  sku: "SKU",
  ebay_order_ref: "eBay order number",
  email: "email",
  months: "number of months",
};

/**
 * Turns database errors that escape a service into clear 4xx responses instead of a bare "Internal server error"
 * (decided 2026-10-08). Services still pre-check the common cases (SKU, eBay order number) for a nicer message; this
 * is the safety net for races and anything not pre-checked. Unknown database errors stay 500 but with a readable
 * message, and are logged.
 */
@Catch(BaseError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Database");

  catch(error: BaseError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, message } = this.describe(error);
    if (status >= 500) this.logger.error(error.message, error.stack);
    res.status(status).json({ statusCode: status, message, error: HttpStatus[status] });
  }

  private describe(error: BaseError): { status: number; message: string } {
    if (error instanceof UniqueConstraintError) {
      const original = (error as UniqueConstraintError & { original?: { constraint?: string } }).original;
      const known = original?.constraint ? UNIQUE_MESSAGES[original.constraint] : undefined;
      if (known) return { status: HttpStatus.CONFLICT, message: known };
      const fields = Object.keys(error.fields ?? {}).filter((f) => f !== "company_id" && f !== "companyId");
      const label = fields.map((f) => FIELD_LABELS[f] ?? f.replace(/_/g, " ")).join(" and ");
      return {
        status: HttpStatus.CONFLICT,
        message: label ? `Something with this ${label} already exists.` : "This record already exists.",
      };
    }
    if (error instanceof ForeignKeyConstraintError) {
      const pgMessage = String((error as ForeignKeyConstraintError & { original?: { message?: string } }).original?.message ?? "");
      return pgMessage.startsWith("update or delete")
        ? { status: HttpStatus.CONFLICT, message: "This can't be removed or changed because other records still use it." }
        : { status: HttpStatus.BAD_REQUEST, message: "Something this refers to no longer exists. Refresh the page and try again." };
    }
    if (error instanceof ValidationError) {
      return { status: HttpStatus.BAD_REQUEST, message: error.errors.map((e) => e.message).join(". ") || "Some values are invalid." };
    }
    if (error instanceof DatabaseError) {
      const code = (error as DatabaseError & { original?: { code?: string } }).original?.code;
      if (code === "22P02") return { status: HttpStatus.BAD_REQUEST, message: "One of the values (or ids) is not in a valid format." };
      if (code === "22001") return { status: HttpStatus.BAD_REQUEST, message: "One of the values is too long." };
      if (code === "22003") return { status: HttpStatus.BAD_REQUEST, message: "One of the numbers is too large." };
      if (code === "23502") return { status: HttpStatus.BAD_REQUEST, message: "A required field is missing." };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: "Something went wrong on our side while saving. Please try again." };
  }
}
