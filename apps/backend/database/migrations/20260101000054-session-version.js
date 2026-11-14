"use strict";

// Security audit 2026-11-13: login tokens carry the account's session version (`sv`); bumping it (password reset or
// change, disable) ends every existing session of that account. Checked on every request by JwtStrategy.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const column = { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 };
    await queryInterface.addColumn("users", "session_version", column);
    await queryInterface.addColumn("backoffice_users", "session_version", column);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("users", "session_version");
    await queryInterface.removeColumn("backoffice_users", "session_version");
  },
};
