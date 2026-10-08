"use strict";

// Auto-delivery per 3PL: when enabled with a number of delivery days, orders the 3PL ships *after* it was
// enabled move SHIPPED -> DELIVERED once that many days have passed (a STOCK order also needs a tracking
// number). orders.shipped_at records when an order was marked shipped; existing SHIPPED/DELIVERED orders
// get their last status change as a best guess (they predate auto-delivery, so it never applies to them).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("three_pl_profiles", "auto_delivery_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("three_pl_profiles", "delivery_days", { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn("three_pl_profiles", "auto_delivery_enabled_at", { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn("orders", "shipped_at", { type: Sequelize.DATE, allowNull: true });
    await queryInterface.sequelize.query(`UPDATE orders SET shipped_at = status_changed_at WHERE status = 'SHIPPED'`);
    await queryInterface.addIndex("orders", ["status", "shipped_at"], { name: "orders_status_shipped_at" });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex("orders", "orders_status_shipped_at");
    await queryInterface.removeColumn("orders", "shipped_at");
    await queryInterface.removeColumn("three_pl_profiles", "auto_delivery_enabled_at");
    await queryInterface.removeColumn("three_pl_profiles", "delivery_days");
    await queryInterface.removeColumn("three_pl_profiles", "auto_delivery_enabled");
  },
};
