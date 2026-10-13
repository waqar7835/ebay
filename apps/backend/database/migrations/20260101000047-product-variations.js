"use strict";

// Product variations (e.g. colors / sizes): each variation is its own product row — own SKU, prices, stock and
// images — linked to its main product by parent_product_id, so orders, stock and invoices treat it as any other
// product. Title, type, Stock Owner and 3PL are copied from the main product. `color` is optional on every product;
// `position` orders a main product's variations.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("products", "parent_product_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "products", key: "id" },
      onDelete: "CASCADE",
    });
    await queryInterface.addColumn("products", "color", { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn("products", "position", { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addIndex("products", ["parent_product_id"], { name: "products_parent_product_id" });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex("products", "products_parent_product_id");
    await queryInterface.removeColumn("products", "position");
    await queryInterface.removeColumn("products", "color");
    await queryInterface.removeColumn("products", "parent_product_id");
  },
};
