"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("orders", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      account_holder_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      stock_owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "products", key: "id" },
        onDelete: "RESTRICT",
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      three_pl_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      status: {
        type: Sequelize.ENUM("PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      ebay_order_ref: { type: Sequelize.STRING, allowNull: false },
      buyer_username: { type: Sequelize.STRING, allowNull: false },
      ebay_net_proceeds: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      shipping_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      sell_price_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      buy_price_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_owner_cost_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      three_pl_price_charged_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      three_pl_payout_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      account_holder_share_percent_snapshot: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      stock_owner_payout_mode_snapshot: {
        type: Sequelize.ENUM("PROFIT_SHARE", "FIXED"),
        allowNull: false,
      },
      stock_owner_share_percent_snapshot: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      restocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("orders", ["company_id"]);
    await queryInterface.addIndex("orders", ["account_holder_id"]);
    await queryInterface.addIndex("orders", ["stock_owner_id"]);
    await queryInterface.addIndex("orders", ["three_pl_id"]);
    await queryInterface.addIndex("orders", ["status"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("orders");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_stock_owner_payout_mode_snapshot";');
  },
};
