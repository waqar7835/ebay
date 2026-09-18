"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("orders", "status_changed_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE "orders" SET "status_changed_at" = "updated_at" WHERE "status_changed_at" IS NULL',
    );
    await queryInterface.changeColumn("orders", "status_changed_at", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    });

    await queryInterface.addColumn("companies", "stale_order_days", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 3,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("companies", "stale_order_days");
    await queryInterface.removeColumn("orders", "status_changed_at");
  },
};
