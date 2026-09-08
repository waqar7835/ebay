"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("products", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      stock_owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      fulfillment_type: {
        type: Sequelize.ENUM("STOCK", "DROPSHIP"),
        allowNull: false,
        defaultValue: "STOCK",
      },
      three_pl_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      sku: { type: Sequelize.STRING, allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      image_url: { type: Sequelize.STRING, allowNull: true },
      stock_owner_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      buy_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      sell_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("products", ["company_id"]);
    await queryInterface.addIndex("products", ["stock_owner_id"]);
    await queryInterface.addConstraint("products", {
      fields: ["company_id", "sku"],
      type: "unique",
      name: "products_company_id_sku_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("products");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_products_fulfillment_type";');
  },
};
