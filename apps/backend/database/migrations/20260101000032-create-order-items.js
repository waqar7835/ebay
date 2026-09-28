"use strict";

// Orders can now hold several STOCK products. Everything product-derived (product, Stock Owner,
// quantity, prices, Stock Owner share terms) moves from `orders` onto per-product `order_items`
// rows; the 3PL fee and Account Holder terms stay on the order (charged once per order).
// Existing orders become a single item each.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("order_items", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onDelete: "CASCADE",
      },
      product_id: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" } },
      stock_owner_id: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" } },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      sell_price_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      buy_price_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      stock_owner_cost_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      stock_owner_payout_mode_snapshot: { type: Sequelize.ENUM("FIXED", "PROFIT_SHARE"), allowNull: true },
      stock_owner_share_percent_snapshot: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("order_items", ["order_id"]);
    await queryInterface.addIndex("order_items", ["stock_owner_id"]);

    await queryInterface.sequelize.query(`
      INSERT INTO order_items (
        id, order_id, product_id, stock_owner_id, position, quantity,
        sell_price_snapshot, buy_price_snapshot, stock_owner_cost_snapshot,
        stock_owner_payout_mode_snapshot, stock_owner_share_percent_snapshot, created_at, updated_at
      )
      SELECT
        gen_random_uuid(), id, product_id, stock_owner_id, 0, quantity,
        sell_price_snapshot, buy_price_snapshot, stock_owner_cost_snapshot,
        stock_owner_payout_mode_snapshot::text::"enum_order_items_stock_owner_payout_mode_snapshot",
        stock_owner_share_percent_snapshot, created_at, updated_at
      FROM orders
    `);

    for (const column of [
      "product_id",
      "stock_owner_id",
      "quantity",
      "sell_price_snapshot",
      "buy_price_snapshot",
      "stock_owner_cost_snapshot",
      "stock_owner_payout_mode_snapshot",
      "stock_owner_share_percent_snapshot",
    ]) {
      await queryInterface.removeColumn("orders", column);
    }
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_orders_stock_owner_payout_mode_snapshot"`);
  },

  // Only lossless while every order still has exactly one item — extra items are dropped.
  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("orders", "product_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "products", key: "id" },
    });
    await queryInterface.addColumn("orders", "stock_owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
    });
    await queryInterface.addColumn("orders", "quantity", { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    await queryInterface.addColumn("orders", "sell_price_snapshot", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn("orders", "buy_price_snapshot", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn("orders", "stock_owner_cost_snapshot", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn("orders", "stock_owner_payout_mode_snapshot", {
      type: Sequelize.ENUM("FIXED", "PROFIT_SHARE"),
      allowNull: true,
    });
    await queryInterface.addColumn("orders", "stock_owner_share_percent_snapshot", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE orders o SET
        product_id = i.product_id,
        stock_owner_id = i.stock_owner_id,
        quantity = i.quantity,
        sell_price_snapshot = i.sell_price_snapshot,
        buy_price_snapshot = i.buy_price_snapshot,
        stock_owner_cost_snapshot = i.stock_owner_cost_snapshot,
        stock_owner_payout_mode_snapshot = i.stock_owner_payout_mode_snapshot::text::"enum_orders_stock_owner_payout_mode_snapshot",
        stock_owner_share_percent_snapshot = i.stock_owner_share_percent_snapshot
      FROM (
        SELECT DISTINCT ON (order_id) * FROM order_items ORDER BY order_id, position
      ) i
      WHERE i.order_id = o.id
    `);
    await queryInterface.changeColumn("orders", "product_id", { type: Sequelize.UUID, allowNull: false });

    await queryInterface.dropTable("order_items");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_order_items_stock_owner_payout_mode_snapshot"`);
  },
};
