"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("backoffice_staff_profiles", {
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "backoffice_users", key: "id" },
        onDelete: "CASCADE",
      },
      can_manage_orders: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      can_manage_stock: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      can_manage_users: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      can_generate_invoices: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      can_view_financials: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("backoffice_staff_profiles");
  },
};
