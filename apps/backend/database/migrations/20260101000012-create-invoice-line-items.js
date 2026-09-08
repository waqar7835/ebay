"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("invoice_line_items", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "invoices", key: "id" },
        onDelete: "CASCADE",
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "orders", key: "id" },
        onDelete: "SET NULL",
      },
      description: { type: Sequelize.STRING, allowNull: false },
      gross_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      deduction_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      net_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      is_adjustment: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("invoice_line_items", ["invoice_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("invoice_line_items");
  },
};
