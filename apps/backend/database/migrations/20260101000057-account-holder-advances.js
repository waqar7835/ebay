"use strict";

// Account Holder advances (decided 2026-11-25): money an Account Holder pays the company up front to process orders.
//  - account_holder_advances: each deposit (amount in the holder's currency, date, note), added by the Admin / partners.
//  - account_holder_advance_usages: how much of which deposit an Account Holder invoice used (oldest deposit first).
//    A deposit with any usage is locked (the service refuses to change or delete it). Deleting an UNPAID invoice cascades its usages away; voiding deletes them.
//  - invoices.advance_used / advance_balance_after: what the invoice took from the advance (total_amount is then the
//    remaining amount) and the balance left right after it (snapshot for the PDF).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("account_holder_advances", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
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
        onDelete: "CASCADE",
      },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      deposit_date: { type: Sequelize.DATEONLY, allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_by_user_id: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addIndex("account_holder_advances", ["account_holder_id"], {
      name: "account_holder_advances_account_holder_id",
    });

    await queryInterface.createTable("account_holder_advance_usages", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      advance_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "account_holder_advances", key: "id" },
        // The service refuses to delete a used deposit; CASCADE only matters if a whole account / company goes.
        onDelete: "CASCADE",
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "invoices", key: "id" },
        onDelete: "CASCADE",
      },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addIndex("account_holder_advance_usages", ["advance_id"], { name: "advance_usages_advance_id" });
    await queryInterface.addIndex("account_holder_advance_usages", ["invoice_id"], { name: "advance_usages_invoice_id" });

    await queryInterface.addColumn("invoices", "advance_used", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("invoices", "advance_balance_after", { type: Sequelize.DECIMAL(12, 2), allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("invoices", "advance_balance_after");
    await queryInterface.removeColumn("invoices", "advance_used");
    await queryInterface.dropTable("account_holder_advance_usages");
    await queryInterface.dropTable("account_holder_advances");
  },
};
