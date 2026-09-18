"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("products", "stock_owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.changeColumn("products", "stock_owner_cost", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.changeColumn("products", "buy_price", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.changeColumn("products", "sell_price", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });

    await queryInterface.changeColumn("orders", "stock_owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.changeColumn("orders", "buy_price_snapshot", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.changeColumn("orders", "sell_price_snapshot", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.changeColumn("orders", "stock_owner_cost_snapshot", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.changeColumn("orders", "stock_owner_payout_mode_snapshot", {
      type: Sequelize.ENUM("FIXED", "PROFIT_SHARE"),
      allowNull: true,
    });
    await queryInterface.addColumn("orders", "supplier_url", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("orders", "supplier_url");
    await queryInterface.changeColumn("orders", "stock_owner_payout_mode_snapshot", {
      type: Sequelize.ENUM("FIXED", "PROFIT_SHARE"),
      allowNull: false,
    });
    await queryInterface.changeColumn("orders", "stock_owner_cost_snapshot", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("orders", "sell_price_snapshot", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("orders", "buy_price_snapshot", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("orders", "stock_owner_id", {
      type: Sequelize.UUID,
      allowNull: false,
    });

    await queryInterface.changeColumn("products", "sell_price", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("products", "buy_price", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("products", "stock_owner_cost", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("products", "stock_owner_id", {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};
