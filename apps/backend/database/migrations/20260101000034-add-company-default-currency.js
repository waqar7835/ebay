"use strict";

// The currency preselected when a company invites Account Holders / Stock Owners / 3PLs.
// Only a default for new users — each user keeps their own `users.currency`.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("companies", "default_currency", {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: "GBP",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("companies", "default_currency");
  },
};
