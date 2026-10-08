"use strict";

// Dropship orders: each line now also holds the "client buying price" — what the company charges the
// Account Holder for the line (all units), entered by Admin/Staff in the Account Holder's currency
// (client_total_original) and converted to PKR (client_total_snapshot). It plays the part a STOCK
// product's sell price plays. Dropship orders also stop charging the Account Holder the flat 3PL fee
// (the dropship 3PL is only paid the buy prices), so it's cleared on dropship orders not yet invoiced.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("order_items", "client_total_snapshot", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn("order_items", "client_total_original", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE orders o
      SET three_pl_price_charged_snapshot = CASE WHEN o.three_pl_id IS NULL THEN NULL ELSE 0 END,
          three_pl_price_charged_original = CASE WHEN o.three_pl_id IS NULL OR o.exchange_rates IS NULL THEN NULL ELSE 0 END
      WHERE o.account_holder_invoice_id IS NULL
        AND EXISTS (
          SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = o.id AND p.fulfillment_type = 'DROPSHIP'
        )
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("order_items", "client_total_original");
    await queryInterface.removeColumn("order_items", "client_total_snapshot");
  },
};
