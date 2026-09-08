"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("orders", "order_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE "orders" SET "order_date" = CURRENT_DATE WHERE "order_date" IS NULL'
    );
    await queryInterface.changeColumn("orders", "order_date", {
      type: Sequelize.DATEONLY,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    });
    await queryInterface.addColumn("orders", "tracking_number", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.renameColumn("orders", "buyer_username", "buyer_details");
    await queryInterface.changeColumn("orders", "buyer_details", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("orders", "buyer_details", {
      type: Sequelize.STRING,
      allowNull: false,
    });
    await queryInterface.renameColumn("orders", "buyer_details", "buyer_username");
    await queryInterface.removeColumn("orders", "tracking_number");
    await queryInterface.removeColumn("orders", "order_date");
  },
};
