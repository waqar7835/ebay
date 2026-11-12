"use strict";

// A dropship 3PL's own free-text notes on an order (an email or anything that helps it find the order later).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("orders", "three_pl_notes", { type: Sequelize.TEXT, allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("orders", "three_pl_notes");
  },
};
