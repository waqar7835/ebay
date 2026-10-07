"use strict";

// Dropship orders can now hold several products, each with its own buy price entered as the line
// total (all units) in the 3PL's currency — by the admin on the order form or later by the 3PL.
// These columns hold that total; a DROPSHIP item's per-unit buy_price_* columns stay null. Existing
// dropship items are moved over (their buy price × quantity).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("order_items", "buy_total_snapshot", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn("order_items", "buy_total_original", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE order_items oi
      SET buy_total_snapshot = oi.buy_price_snapshot * oi.quantity,
          buy_total_original = oi.buy_price_original * oi.quantity,
          buy_price_snapshot = NULL,
          buy_price_original = NULL
      FROM products p
      WHERE p.id = oi.product_id AND p.fulfillment_type = 'DROPSHIP'
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE order_items oi
      SET buy_price_snapshot = oi.buy_total_snapshot / NULLIF(oi.quantity, 0),
          buy_price_original = oi.buy_total_original / NULLIF(oi.quantity, 0)
      FROM products p
      WHERE p.id = oi.product_id AND p.fulfillment_type = 'DROPSHIP'
    `);
    await queryInterface.removeColumn("order_items", "buy_total_original");
    await queryInterface.removeColumn("order_items", "buy_total_snapshot");
  },
};
