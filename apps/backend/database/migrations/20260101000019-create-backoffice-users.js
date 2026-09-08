"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("backoffice_users", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: true },
      status: {
        type: Sequelize.ENUM("INVITED", "ACTIVE", "DISABLED"),
        allowNull: false,
        defaultValue: "INVITED",
      },
      role: {
        type: Sequelize.ENUM("SUPER_ADMIN", "PLATFORM_STAFF"),
        allowNull: false,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("backoffice_users");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_backoffice_users_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_backoffice_users_role";');
  },
};
