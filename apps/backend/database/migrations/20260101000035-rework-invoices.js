"use strict";

// Invoices are no longer per billing cycle. A company Admin (or Staff with canGenerateInvoices) picks
// any open SHIPPED/DELIVERED orders for one Account Holder / Stock Owner / 3PL, adds misc lines and
// approves. Each order records which invoice claimed it, per role:
//   orders.account_holder_invoice_id, orders.three_pl_invoice_id, order_items.stock_owner_invoice_id
// (Stock Owner is per item, since one order can mix Stock Owners). The *_refund_invoice_id columns
// record which invoice carried the negative adjustment for an invoiced order that was later refunded.
// Empty = open. Deleting (UNPAID) or voiding (PAID) an invoice clears them again.
// Pre-launch: existing cycle-based invoices are deleted rather than migrated.
const ORDER_COLUMNS = [
  ["orders", "account_holder_invoice_id"],
  ["orders", "account_holder_refund_invoice_id"],
  ["orders", "three_pl_invoice_id"],
  ["orders", "three_pl_refund_invoice_id"],
  ["order_items", "stock_owner_invoice_id"],
  ["order_items", "stock_owner_refund_invoice_id"],
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query("DELETE FROM invoice_line_items");
    await queryInterface.sequelize.query("DELETE FROM invoices");

    await queryInterface.removeConstraint("invoices", "invoices_user_role_period_unique");
    await queryInterface.removeColumn("invoices", "period_start");
    await queryInterface.removeColumn("invoices", "period_end");
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invoices_status" ADD VALUE IF NOT EXISTS 'VOID'`);
    await queryInterface.addColumn("invoices", "invoice_number", { type: Sequelize.STRING(32), allowNull: false });
    await queryInterface.addColumn("invoices", "sequence", { type: Sequelize.INTEGER, allowNull: false });
    // PKR for Stock Owner / 3PL invoices; the Account Holder's own currency on theirs.
    await queryInterface.addColumn("invoices", "currency", {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: "PKR",
    });
    await queryInterface.addColumn("invoices", "voided_at", { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addConstraint("invoices", {
      fields: ["company_id", "sequence"],
      type: "unique",
      name: "invoices_company_sequence_unique",
    });
    // Last invoice number handed out, so a deleted invoice's number is never reused.
    await queryInterface.addColumn("companies", "last_invoice_sequence", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.removeColumn("invoice_line_items", "is_adjustment");
    // ORDER | REFUND | MISC
    await queryInterface.addColumn("invoice_line_items", "kind", {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: "ORDER",
    });
    // Breakdown the PDF is drawn from (products/qty/prices/share %), snapshotted at approval.
    await queryInterface.addColumn("invoice_line_items", "details", { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn("invoice_line_items", "position", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    for (const [table, column] of ORDER_COLUMNS) {
      await queryInterface.addColumn(table, column, {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "invoices", key: "id" },
        onDelete: "SET NULL",
      });
      await queryInterface.addIndex(table, [column]);
    }
  },

  down: async (queryInterface, Sequelize) => {
    for (const [table, column] of ORDER_COLUMNS) {
      await queryInterface.removeColumn(table, column);
    }
    await queryInterface.sequelize.query("DELETE FROM invoice_line_items");
    await queryInterface.sequelize.query("DELETE FROM invoices");
    await queryInterface.removeColumn("invoice_line_items", "position");
    await queryInterface.removeColumn("invoice_line_items", "details");
    await queryInterface.removeColumn("invoice_line_items", "kind");
    await queryInterface.addColumn("invoice_line_items", "is_adjustment", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.removeColumn("companies", "last_invoice_sequence");
    await queryInterface.removeConstraint("invoices", "invoices_company_sequence_unique");
    await queryInterface.removeColumn("invoices", "voided_at");
    await queryInterface.removeColumn("invoices", "currency");
    await queryInterface.removeColumn("invoices", "sequence");
    await queryInterface.removeColumn("invoices", "invoice_number");
    // The VOID enum value can't be dropped from a Postgres enum; it's harmless left in place.
    await queryInterface.addColumn("invoices", "period_start", { type: Sequelize.DATEONLY, allowNull: false });
    await queryInterface.addColumn("invoices", "period_end", { type: Sequelize.DATEONLY, allowNull: false });
    await queryInterface.addConstraint("invoices", {
      fields: ["user_id", "role", "period_start", "period_end"],
      type: "unique",
      name: "invoices_user_role_period_unique",
    });
  },
};
