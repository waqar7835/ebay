"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("invoices", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      role: {
        type: Sequelize.ENUM("ADMIN", "STAFF", "ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"),
        allowNull: false,
      },
      period_start: { type: Sequelize.DATEONLY, allowNull: false },
      period_end: { type: Sequelize.DATEONLY, allowNull: false },
      status: {
        type: Sequelize.ENUM("UNPAID", "PAID"),
        allowNull: false,
        defaultValue: "UNPAID",
      },
      total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      generated_by_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      generated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      paid_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("invoices", ["company_id"]);
    await queryInterface.addIndex("invoices", ["user_id"]);
    await queryInterface.addConstraint("invoices", {
      fields: ["user_id", "role", "period_start", "period_end"],
      type: "unique",
      name: "invoices_user_role_period_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("invoices");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_role";');
  },
};
