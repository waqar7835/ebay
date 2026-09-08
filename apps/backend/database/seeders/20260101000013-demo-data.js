"use strict";

const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const passwordHash = await bcrypt.hash("changeme123", 10);

    const companyId = randomUUID();
    const adminId = randomUUID();
    const accountHolderId = randomUUID();
    const stockOwnerId = randomUUID();
    const threePlId = randomUUID();
    const productId = randomUUID();

    await queryInterface.bulkInsert("companies", [
      {
        id: companyId,
        name: "Demo Company",
        logo_url: null,
        email_verified_at: now,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("users", [
      {
        id: adminId,
        company_id: companyId,
        name: "Demo Admin",
        email: "admin@example.com",
        password_hash: passwordHash,
        status: "ACTIVE",
        created_at: now,
        updated_at: now,
      },
      {
        id: accountHolderId,
        company_id: companyId,
        name: "Demo Account Holder",
        email: "accountholder@example.com",
        password_hash: passwordHash,
        status: "ACTIVE",
        created_at: now,
        updated_at: now,
      },
      {
        id: stockOwnerId,
        company_id: companyId,
        name: "Demo Stock Owner",
        email: "stockowner@example.com",
        password_hash: passwordHash,
        status: "ACTIVE",
        created_at: now,
        updated_at: now,
      },
      {
        id: threePlId,
        company_id: companyId,
        name: "Demo 3PL",
        email: "threepl@example.com",
        password_hash: passwordHash,
        status: "ACTIVE",
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("user_roles", [
      { id: randomUUID(), user_id: adminId, role: "ADMIN", created_at: now, updated_at: now },
      { id: randomUUID(), user_id: accountHolderId, role: "ACCOUNT_HOLDER", created_at: now, updated_at: now },
      { id: randomUUID(), user_id: stockOwnerId, role: "STOCK_OWNER", created_at: now, updated_at: now },
      { id: randomUUID(), user_id: threePlId, role: "THREE_PL", created_at: now, updated_at: now },
    ]);

    await queryInterface.bulkInsert("account_holder_profiles", [
      {
        user_id: accountHolderId,
        share_percent: 20,
        three_pl_price_charged: 5,
        billing_cycle_start_day: 1,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("stock_owner_profiles", [
      {
        user_id: stockOwnerId,
        payout_mode: "PROFIT_SHARE",
        share_percent: 40,
        billing_cycle_start_day: 1,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("three_pl_profiles", [
      {
        user_id: threePlId,
        payout_per_order: 3,
        billing_cycle_start_day: 1,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("products", [
      {
        id: productId,
        company_id: companyId,
        stock_owner_id: stockOwnerId,
        fulfillment_type: "STOCK",
        three_pl_id: threePlId,
        sku: "DEMO-SKU-1",
        title: "Demo Product",
        image_url: null,
        stock_owner_cost: 100,
        buy_price: 200,
        sell_price: 250,
        stock_quantity: 50,
        created_at: now,
        updated_at: now,
      },
    ]);

    console.log("Seeded demo company. Login with admin@example.com / accountholder@example.com / stockowner@example.com / threepl@example.com, password: changeme123");
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete("companies", { name: "Demo Company" });
  },
};
