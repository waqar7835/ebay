"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("seat_payment_order_items", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      seat_payment_order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "seat_payment_orders", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      period_start: { type: Sequelize.DATEONLY, allowNull: false },
      period_end: { type: Sequelize.DATEONLY, allowNull: false },
      months: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("seat_payment_order_items", ["seat_payment_order_id"]);
    await queryInterface.addIndex("seat_payment_order_items", ["user_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("seat_payment_order_items");
  },
};
