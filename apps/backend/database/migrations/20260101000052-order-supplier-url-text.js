"use strict";

// The order's supplier/product listing field is free text (several links, notes): VARCHAR(255) was too short.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("orders", "supplier_url", { type: Sequelize.TEXT, allowNull: true });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`UPDATE orders SET supplier_url = LEFT(supplier_url, 255) WHERE LENGTH(supplier_url) > 255`);
    await queryInterface.changeColumn("orders", "supplier_url", { type: Sequelize.STRING, allowNull: true });
  },
};
