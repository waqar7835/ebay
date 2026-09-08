"use strict";

const { randomUUID } = require("crypto");

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert("platform_settings", [
      { id: randomUUID(), seat_price_per_month: 10, created_at: now, updated_at: now },
    ]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete("platform_settings", {});
  },
};
