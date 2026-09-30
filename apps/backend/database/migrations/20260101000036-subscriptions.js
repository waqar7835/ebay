"use strict";

const { randomUUID } = require("crypto");
const bcrypt = require("bcrypt");

// Replaces per-seat billing with company subscriptions: a company is on one plan (free unless a
// paid plan is active) whose limits cap how many Account Holder / Stock Owner / 3PL / Staff
// accounts it can have. Paid plans are bought for a billing period (1/3/6/12 months, each with
// its own discount) by uploading a receipt that the Super Admin approves.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    };

    await queryInterface.createTable("subscription_plans", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.STRING, allowNull: true },
      price_per_month: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      max_account_holders: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_stock_owners: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_three_pls: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_staff: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_free: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps,
    });

    const plan = (name, description, price, ah, so, tpl, staff, sort, isFree = false) => ({
      id: randomUUID(),
      name,
      description,
      price_per_month: price,
      max_account_holders: ah,
      max_stock_owners: so,
      max_three_pls: tpl,
      max_staff: staff,
      is_free: isFree,
      is_active: true,
      sort_order: sort,
      created_at: now,
      updated_at: now,
    });
    await queryInterface.bulkInsert("subscription_plans", [
      plan("Starter", "Free forever — for trying the platform out", 0, 3, 1, 2, 1, 0, true),
      plan("Growth", "For growing teams", 10000, 10, 10, 10, 3, 1),
      plan("Business", "For established operations", 15000, 15, 15, 15, 5, 2),
      plan("Enterprise", "For large multi-account operations", 25000, 30, 30, 30, 10, 3),
    ]);

    await queryInterface.createTable("subscription_billing_periods", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      months: { type: Sequelize.INTEGER, allowNull: false, unique: true },
      discount_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps,
    });
    await queryInterface.bulkInsert(
      "subscription_billing_periods",
      [
        [1, 0],
        [3, 5],
        [6, 10],
        [12, 20],
      ].map(([months, discount]) => ({
        id: randomUUID(),
        months,
        discount_percent: discount,
        is_active: true,
        created_at: now,
        updated_at: now,
      })),
    );

    await queryInterface.createTable("subscription_payments", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "companies", key: "id" },
        onDelete: "CASCADE",
      },
      plan_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "subscription_plans", key: "id" },
        onDelete: "RESTRICT",
      },
      // Snapshots, so later plan/period edits never rewrite what was paid for.
      plan_name: { type: Sequelize.STRING, allowNull: false },
      months: { type: Sequelize.INTEGER, allowNull: false },
      price_per_month: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      discount_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      status: {
        type: Sequelize.ENUM("SUBMITTED", "APPROVED", "REJECTED"),
        allowNull: false,
        defaultValue: "SUBMITTED",
      },
      receipt_file_url: { type: Sequelize.STRING, allowNull: true },
      reference_note: { type: Sequelize.STRING, allowNull: true },
      submitted_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      reviewed_by_backoffice_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "backoffice_users", key: "id" },
        onDelete: "SET NULL",
      },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      period_start: { type: Sequelize.DATEONLY, allowNull: true },
      period_end: { type: Sequelize.DATEONLY, allowNull: true },
      ...timestamps,
    });
    await queryInterface.addIndex("subscription_payments", ["company_id"]);
    await queryInterface.addIndex("subscription_payments", ["status"]);

    // null plan = the free plan.
    await queryInterface.addColumn("companies", "subscription_plan_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "subscription_plans", key: "id" },
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("companies", "subscription_ends_at", { type: Sequelize.DATEONLY, allowNull: true });
    await queryInterface.addColumn("companies", "subscription_reminders_sent", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.removeColumn("companies", "free_account_holder_used");
    await queryInterface.removeColumn("companies", "free_stock_owner_used");
    await queryInterface.removeColumn("companies", "free_three_pl_used");

    await queryInterface.addColumn("users", "disabled_by_subscription", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    // Set once an invite is accepted, so re-enabling a disabled account that never set its password
    // puts it back to INVITED instead of ACTIVE with the placeholder invite password.
    await queryInterface.addColumn("users", "invite_accepted_at", { type: Sequelize.DATE, allowNull: true });
    await queryInterface.sequelize.query(`UPDATE users SET invite_accepted_at = updated_at WHERE status = 'ACTIVE'`);
    const [disabled] = await queryInterface.sequelize.query(
      `SELECT id, password_hash FROM users WHERE status = 'DISABLED' AND password_hash IS NOT NULL`,
    );
    for (const user of disabled) {
      if (!(await bcrypt.compare("changeme", user.password_hash))) {
        await queryInterface.sequelize.query(`UPDATE users SET invite_accepted_at = updated_at WHERE id = :id`, {
          replacements: { id: user.id },
        });
      }
    }

    await queryInterface.dropTable("seat_payment_order_items");
    await queryInterface.dropTable("seat_payment_orders");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_seat_payment_orders_status";');
    await queryInterface.dropTable("seat_billings");
    await queryInterface.dropTable("platform_settings");
  },

  down: async (queryInterface, Sequelize) => {
    const now = new Date();
    await require("./20260101000014-create-platform-settings.js").up(queryInterface, Sequelize);
    await queryInterface.bulkInsert("platform_settings", [
      { id: randomUUID(), seat_price_per_month: 10, created_at: now, updated_at: now },
    ]);
    await require("./20260101000015-create-seat-billings.js").up(queryInterface, Sequelize);
    await require("./20260101000016-create-seat-payment-orders.js").up(queryInterface, Sequelize);
    await require("./20260101000017-create-seat-payment-order-items.js").up(queryInterface, Sequelize);

    await queryInterface.removeColumn("users", "invite_accepted_at");
    await queryInterface.removeColumn("users", "disabled_by_subscription");
    for (const column of ["free_account_holder_used", "free_stock_owner_used", "free_three_pl_used"]) {
      await queryInterface.addColumn("companies", column, { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    await queryInterface.removeColumn("companies", "subscription_reminders_sent");
    await queryInterface.removeColumn("companies", "subscription_ends_at");
    await queryInterface.removeColumn("companies", "subscription_plan_id");
    await queryInterface.dropTable("subscription_payments");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_subscription_payments_status";');
    await queryInterface.dropTable("subscription_billing_periods");
    await queryInterface.dropTable("subscription_plans");
  },
};
