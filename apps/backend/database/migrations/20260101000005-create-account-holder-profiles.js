"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("account_holder_profiles", {
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      share_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      three_pl_price_charged: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      billing_cycle_start_day: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("account_holder_profiles");
  },
};
