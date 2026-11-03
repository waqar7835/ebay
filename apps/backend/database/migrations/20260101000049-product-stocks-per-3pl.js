"use strict";

// Stock per 3PL (decided 2026-11-03): a STOCK product can be held at several 3PLs, each with its own quantity
// (product_stocks: one row per product + 3PL). Variations share their main product's list of 3PLs, each with its own
// quantities. products.stock_quantity stays as the total over the product's rows (kept in sync by the backend), and
// products.three_pl_id goes away: every existing STOCK product (and variation) gets one row with its old 3PL and quantity.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("product_stocks", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "products", key: "id" },
        onDelete: "CASCADE",
      },
      three_pl_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addIndex("product_stocks", ["product_id", "three_pl_id"], {
      unique: true,
      name: "product_stocks_product_three_pl_unique",
    });
    await queryInterface.addIndex("product_stocks", ["three_pl_id"], { name: "product_stocks_three_pl_id" });

    await queryInterface.sequelize.query(`
      INSERT INTO product_stocks (id, product_id, three_pl_id, quantity, created_at, updated_at)
      SELECT gen_random_uuid(), id, three_pl_id, stock_quantity, NOW(), NOW()
      FROM products
      WHERE fulfillment_type = 'STOCK' AND three_pl_id IS NOT NULL
    `);
    await queryInterface.removeColumn("products", "three_pl_id");
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("products", "three_pl_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
    });
    // Back to one 3PL per product: the one holding the most units (all of the stock is kept as the total).
    await queryInterface.sequelize.query(`
      UPDATE products p SET three_pl_id = (
        SELECT ps.three_pl_id FROM product_stocks ps WHERE ps.product_id = p.id ORDER BY ps.quantity DESC, ps.created_at ASC LIMIT 1
      )
    `);
    await queryInterface.dropTable("product_stocks");
  },
};
