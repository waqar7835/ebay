"use strict";

// Per-user currencies. Account Holder / Stock Owner / 3PL amounts are entered in the user's own
// currency and converted to PKR on each order with exchange rates snapshotted on that order. The
// existing amount columns now hold the PKR values; the new *_original columns hold what was entered.
// Existing orders get no currency/rates (treated as PKR, rate 1) until re-saved with "recalculate".
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("users", "currency", {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: "GBP",
    });

    // Latest known PKR rate per currency, refreshed from the live API and used as a fallback when it's down.
    await queryInterface.createTable("exchange_rates", {
      currency: { type: Sequelize.STRING(3), primaryKey: true, allowNull: false },
      rate: { type: Sequelize.DECIMAL(14, 6), allowNull: false },
      fetched_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addColumn("orders", "account_holder_currency", { type: Sequelize.STRING(3), allowNull: true });
    await queryInterface.addColumn("orders", "three_pl_currency", { type: Sequelize.STRING(3), allowNull: true });
    await queryInterface.addColumn("orders", "exchange_rates", { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn("orders", "exchange_rates_at", { type: Sequelize.DATE, allowNull: true });
    for (const column of [
      "ebay_net_proceeds_original",
      "shipping_cost_original",
      "three_pl_price_charged_original",
      "three_pl_payout_original",
    ]) {
      await queryInterface.addColumn("orders", column, { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    }

    await queryInterface.addColumn("order_items", "currency", { type: Sequelize.STRING(3), allowNull: true });
    for (const column of ["sell_price_original", "buy_price_original", "stock_owner_cost_original"]) {
      await queryInterface.addColumn("order_items", column, { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    }
  },

  down: async (queryInterface) => {
    for (const column of ["currency", "sell_price_original", "buy_price_original", "stock_owner_cost_original"]) {
      await queryInterface.removeColumn("order_items", column);
    }
    for (const column of [
      "account_holder_currency",
      "three_pl_currency",
      "exchange_rates",
      "exchange_rates_at",
      "ebay_net_proceeds_original",
      "shipping_cost_original",
      "three_pl_price_charged_original",
      "three_pl_payout_original",
    ]) {
      await queryInterface.removeColumn("orders", column);
    }
    await queryInterface.dropTable("exchange_rates");
    await queryInterface.removeColumn("users", "currency");
  },
};
