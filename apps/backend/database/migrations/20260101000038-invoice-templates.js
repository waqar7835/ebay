"use strict";

// Invoice templates: five predefined ones (in code) plus up to five custom ones per company, each a
// fixed layout + five colors + an optional logo. The company picks a default; each invoice freezes
// the style it was approved with (`invoices.template`, null = issued before templates existed).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("invoice_templates", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(60), allowNull: false },
      layout: { type: Sequelize.STRING(16), allowNull: false },
      colors: { type: Sequelize.JSONB, allowNull: false },
      logo_url: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("invoice_templates", ["company_id"]);

    // A predefined template key ("classic", …) or a custom template's id; null = "classic".
    await queryInterface.addColumn("companies", "default_invoice_template_id", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("invoices", "template", { type: Sequelize.JSONB, allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("invoices", "template");
    await queryInterface.removeColumn("companies", "default_invoice_template_id");
    await queryInterface.dropTable("invoice_templates");
  },
};
