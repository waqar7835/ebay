"use strict";

// Platform-wide settings managed by the Super Admin in the backoffice (replaces the SMTP_* / MAIL_FROM /
// CONTACT_EMAIL env vars): public-site branding and contact details, where contact-form messages go, and SMTP.
// Always exactly one row, id = 1. The SMTP password is stored encrypted (see common/secret-box.util.ts).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("platform_settings", {
      id: { type: Sequelize.INTEGER, primaryKey: true },
      brand_name: { type: Sequelize.STRING, allowNull: false, defaultValue: "OrderSplit" },
      logo_url: { type: Sequelize.STRING, allowNull: true },
      hello_email: { type: Sequelize.STRING, allowNull: true },
      support_email: { type: Sequelize.STRING, allowNull: true },
      contact_email: { type: Sequelize.STRING, allowNull: true },
      reply_hours: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      reply_timezone: { type: Sequelize.STRING, allowNull: true },
      smtp_host: { type: Sequelize.STRING, allowNull: true },
      smtp_port: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 587 },
      smtp_secure: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      smtp_user: { type: Sequelize.STRING, allowNull: true },
      smtp_password_encrypted: { type: Sequelize.TEXT, allowNull: true },
      mail_from_name: { type: Sequelize.STRING, allowNull: true },
      mail_from_email: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    const now = new Date();
    await queryInterface.bulkInsert("platform_settings", [
      {
        id: 1,
        brand_name: "OrderSplit",
        reply_hours: JSON.stringify([
          { days: "Monday to Friday", hours: "10:00 to 19:00" },
          { days: "Saturday", hours: "11:00 to 16:00" },
          { days: "Sunday", hours: "Closed" },
        ]),
        reply_timezone: "Pakistan Standard Time (PKT)",
        smtp_port: 587,
        smtp_secure: false,
        created_at: now,
        updated_at: now,
      },
    ]);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("platform_settings");
  },
};
