"use strict";

const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const passwordHash = await bcrypt.hash("changeme123", 10);
    const userId = randomUUID();

    await queryInterface.bulkInsert("backoffice_users", [
      {
        id: userId,
        name: "Platform Staff",
        email: "platformstaff@example.com",
        password_hash: passwordHash,
        status: "ACTIVE",
        role: "PLATFORM_STAFF",
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("backoffice_staff_profiles", [
      {
        user_id: userId,
        can_manage_orders: true,
        can_manage_stock: true,
        can_manage_users: true,
        can_generate_invoices: true,
        can_view_financials: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    console.log("Seeded platform staff: platformstaff@example.com / changeme123");
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete("backoffice_users", { email: "platformstaff@example.com" });
  },
};
