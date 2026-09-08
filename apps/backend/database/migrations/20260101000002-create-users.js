"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("users", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: true },
      status: {
        type: Sequelize.ENUM("INVITED", "ACTIVE", "DISABLED"),
        allowNull: false,
        defaultValue: "INVITED",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("users", ["company_id"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("users");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_status";');
  },
};
