"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("three_pl_profiles", "fulfillment_type", {
      type: Sequelize.ENUM("STOCK", "DROPSHIP"),
      allowNull: false,
      defaultValue: "STOCK",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("three_pl_profiles", "fulfillment_type");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_three_pl_profiles_fulfillment_type";');
  },
};
