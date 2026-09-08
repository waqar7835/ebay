"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("verification_tokens", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      token: { type: Sequelize.STRING, allowNull: false, unique: true },
      email: { type: Sequelize.STRING, allowNull: false },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      purpose: {
        type: Sequelize.ENUM("EMAIL_VERIFY", "PASSWORD_RESET", "USER_INVITE"),
        allowNull: false,
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("verification_tokens", ["token"]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("verification_tokens");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_verification_tokens_purpose";');
  },
};
