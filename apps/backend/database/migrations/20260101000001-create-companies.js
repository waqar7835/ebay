"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("companies", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      logo_url: { type: Sequelize.STRING, allowNull: true },
      email_verified_at: { type: Sequelize.DATE, allowNull: true },
      billing_anchor_day: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      free_account_holder_used: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      free_stock_owner_used: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      free_three_pl_used: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("companies");
  },
};
