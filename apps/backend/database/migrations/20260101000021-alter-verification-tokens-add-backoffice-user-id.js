"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("verification_tokens", "backoffice_user_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "backoffice_users", key: "id" },
      onDelete: "CASCADE",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("verification_tokens", "backoffice_user_id");
  },
};
