"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("seat_payment_orders", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      submitted_by_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
      },
      status: {
        type: Sequelize.ENUM("SUBMITTED", "PAID", "REJECTED"),
        allowNull: false,
        defaultValue: "SUBMITTED",
      },
      total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      receipt_file_url: { type: Sequelize.STRING, allowNull: true },
      reference_note: { type: Sequelize.STRING, allowNull: true },
      reviewed_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("seat_payment_orders", ["company_id"]);
    await queryInterface.addIndex("seat_payment_orders", ["status"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("seat_payment_orders");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_seat_payment_orders_status";');
  },
};
