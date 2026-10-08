"use strict";

// Free-text comments on an order, written by the Admin/Staff on the order form for the order's 3PL. Shown to the 3PL
// (and managers) as a red info icon on the orders list; never sent to Account Holders or Stock Owners.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("orders", "comments", { type: Sequelize.TEXT, allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("orders", "comments");
  },
};
