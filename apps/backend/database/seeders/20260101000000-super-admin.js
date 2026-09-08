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
        name: "Super Admin",
        email: "superadmin@example.com",
        password_hash: passwordHash,
        status: "ACTIVE",
        role: "SUPER_ADMIN",
        created_at: now,
        updated_at: now,
      },
    ]);

    console.log("Seeded super admin: superadmin@example.com / changeme123");
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete("backoffice_users", { email: "superadmin@example.com" });
  },
};
