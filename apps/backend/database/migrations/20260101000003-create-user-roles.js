"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("user_roles", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      role: {
        type: Sequelize.ENUM("SUPER_ADMIN", "ADMIN", "STAFF", "ACCOUNT_HOLDER", "STOCK_OWNER", "THREE_PL"),
        allowNull: false,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addConstraint("user_roles", {
      fields: ["user_id", "role"],
      type: "unique",
      name: "user_roles_user_id_role_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("user_roles");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_roles_role";');
  },
};
