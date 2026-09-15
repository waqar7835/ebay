"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("verification_tokens", "code", {
      type: Sequelize.STRING(6),
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("verification_tokens", "code");
  },
};
