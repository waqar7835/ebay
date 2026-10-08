"use strict";

// Refunds can now be full or partial. The refunded amount is entered in the order's Account Holder
// currency (refund_amount_original, like the eBay payout) and stored in PKR (refund_amount). Orders
// already REFUNDED before this were full refunds, so they get their payout as the refunded amount.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("orders", "refund_amount", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn("orders", "refund_amount_original", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE orders
      SET refund_amount = ebay_net_proceeds, refund_amount_original = ebay_net_proceeds_original
      WHERE status = 'REFUNDED'
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("orders", "refund_amount_original");
    await queryInterface.removeColumn("orders", "refund_amount");
  },
};
