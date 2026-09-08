"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("stock_owner_profiles", {
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      payout_mode: {
        type: Sequelize.ENUM("PROFIT_SHARE", "FIXED"),
        allowNull: false,
        defaultValue: "FIXED",
      },
      share_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      billing_cycle_start_day: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("stock_owner_profiles");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stock_owner_profiles_payout_mode";');
  },
};
