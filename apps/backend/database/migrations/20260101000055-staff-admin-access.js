"use strict";

// A partner the company Admin gives "Admin access" (2026-11-13): can do whatever the Admin can, except change the
// Admin's account or any partner's settings (%, permissions, Admin access). Only meaningful when is_partner.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("staff_profiles", "has_admin_access", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("staff_profiles", "has_admin_access");
  },
};
