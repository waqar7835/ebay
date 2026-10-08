"use strict";

// Browser-tab icon for the public site, portal and backoffice, uploaded by the Super Admin on backoffice /settings.
// null = the platform logo is used as the favicon.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("platform_settings", "favicon_url", { type: Sequelize.STRING, allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("platform_settings", "favicon_url");
  },
};
