"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("seat_billings", {
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      paid_through_date: { type: Sequelize.DATEONLY, allowNull: true },
      reminders_sent_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_reminder_sent_at: { type: Sequelize.DATE, allowNull: true },
      blocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("seat_billings");
  },
};
