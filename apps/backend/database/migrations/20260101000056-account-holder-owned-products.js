"use strict";

// Account Holder as product owner (decided 2026-11-19): when an Account Holder is also a Stock Owner (same email in the
// same company, or one account holding both roles), the Admin / partners pick which of that Stock Owner's products
// (main products; variations follow) the Account Holder "owns". On those order lines the Account Holder is charged the
// product's cost instead of its sell price, the Stock Owner is paid the cost only (no markup, no cut).
//  - account_holder_owned_products: the picked main products per Account Holder.
//  - account_holder_profiles.auto_add_owned_products: new products of the linked Stock Owner join the list (default on).
//  - order_items.owner_priced: the line was priced as owned (snapshotted, refreshed only by "resync prices").
// Existing pairs start with every one of their linked Stock Owner's STOCK main products selected.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("account_holder_owned_products", {
      account_holder_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "products", key: "id" },
        onDelete: "CASCADE",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addIndex("account_holder_owned_products", ["product_id"], { name: "account_holder_owned_products_product_id" });
    await queryInterface.addColumn("account_holder_profiles", "auto_add_owned_products", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn("order_items", "owner_priced", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });

    await queryInterface.sequelize.query(`
      INSERT INTO account_holder_owned_products (account_holder_id, product_id, created_at, updated_at)
      SELECT DISTINCT ah.id, p.id, NOW(), NOW()
      FROM users ah
      JOIN user_roles ahr ON ahr.user_id = ah.id AND ahr.role = 'ACCOUNT_HOLDER'
      JOIN users so ON so.company_id = ah.company_id AND (so.id = ah.id OR lower(so.email) = lower(ah.email))
      JOIN user_roles sor ON sor.user_id = so.id AND sor.role = 'STOCK_OWNER'
      JOIN products p ON p.stock_owner_id = so.id AND p.company_id = ah.company_id
        AND p.parent_product_id IS NULL AND p.fulfillment_type = 'STOCK'
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("order_items", "owner_priced");
    await queryInterface.removeColumn("account_holder_profiles", "auto_add_owned_products");
    await queryInterface.dropTable("account_holder_owned_products");
  },
};
