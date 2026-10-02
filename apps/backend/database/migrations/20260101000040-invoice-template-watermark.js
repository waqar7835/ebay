"use strict";

// Invoice template watermarks, and company edits to the predefined templates. An edited predefined
// template is an `invoice_templates` row with `predefined_key` set ("classic", …): it holds that
// company's colors / logo / watermark for it, doesn't count toward the custom-template limit, and
// deleting it resets the template to the original. Invoices keep freezing the style (now incl. the
// watermark) in `invoices.template`.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("invoice_templates", "watermark", { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn("invoice_templates", "predefined_key", { type: Sequelize.STRING(16), allowNull: true });
    await queryInterface.addIndex("invoice_templates", ["company_id", "predefined_key"], {
      unique: true,
      name: "invoice_templates_company_predefined_key",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex("invoice_templates", "invoice_templates_company_predefined_key");
    await queryInterface.removeColumn("invoice_templates", "predefined_key");
    await queryInterface.removeColumn("invoice_templates", "watermark");
  },
};
