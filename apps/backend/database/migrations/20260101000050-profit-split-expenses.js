"use strict";

// Profit split, expenses & profit statements (decided 2026-11-05).
// - Staff "Revenue share" becomes "Partner" (is_partner + partner_percent) + a permission to generate/delete statements.
// - The company Admin's own % lives on companies; the company gets 100 − Admin − partners.
// - A profit statement freezes one billing cycle: the orders / refunds / invoice misc lines / expenses it counted
//   point at it, so nothing is ever counted twice.
// - Account Holder invoices store the PKR rate of their currency (their misc lines are converted with it).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const q = queryInterface.sequelize;

    await queryInterface.renameColumn("staff_profiles", "has_revenue_share", "is_partner");
    await queryInterface.renameColumn("staff_profiles", "share_percent", "partner_percent");
    await queryInterface.addColumn("staff_profiles", "can_manage_profit_statements", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("companies", "admin_profit_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("companies", "profit_opening_balance", { type: Sequelize.DECIMAL(14, 2), allowNull: true });
    await queryInterface.addColumn("companies", "profit_opening_cycle_start", { type: Sequelize.DATEONLY, allowNull: true });
    await queryInterface.addColumn("companies", "last_profit_statement_sequence", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.createTable("profit_statements", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
      company_id: { type: Sequelize.UUID, allowNull: false, references: { model: "companies", key: "id" }, onDelete: "CASCADE" },
      statement_number: { type: Sequelize.STRING(32), allowNull: false },
      sequence: { type: Sequelize.INTEGER, allowNull: false },
      cycle_start: { type: Sequelize.DATEONLY, allowNull: false },
      cycle_end: { type: Sequelize.DATEONLY, allowNull: false },
      generated_by_user_id: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "id" } },
      generated_at: { type: Sequelize.DATE, allowNull: false },
      template: { type: Sequelize.JSONB, allowNull: true },
      snapshot: { type: Sequelize.JSONB, allowNull: false },
      total_profit: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      company_closing_balance: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addIndex("profit_statements", ["company_id", "cycle_start"], {
      unique: true,
      name: "profit_statements_company_cycle_unique",
    });

    const statementRef = {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "profit_statements", key: "id" },
      onDelete: "SET NULL",
    };
    await queryInterface.addColumn("orders", "profit_statement_id", statementRef);
    await queryInterface.addColumn("orders", "refund_profit_statement_id", statementRef);
    await queryInterface.addColumn("invoices", "profit_statement_id", statementRef);
    await queryInterface.addColumn("invoices", "pkr_rate", { type: Sequelize.DECIMAL(18, 6), allowNull: true });

    await queryInterface.createTable("expense_categories", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
      company_id: { type: Sequelize.UUID, allowNull: false, references: { model: "companies", key: "id" }, onDelete: "CASCADE" },
      name: { type: Sequelize.STRING(60), allowNull: false },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await q.query(
      `CREATE UNIQUE INDEX expense_categories_company_name_unique ON expense_categories (company_id, lower(name))`,
    );

    await queryInterface.createTable("expenses", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
      company_id: { type: Sequelize.UUID, allowNull: false, references: { model: "companies", key: "id" }, onDelete: "CASCADE" },
      title: { type: Sequelize.STRING(120), allowNull: false },
      amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      expense_date: { type: Sequelize.DATEONLY, allowNull: false },
      category_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "expense_categories", key: "id" },
        onDelete: "SET NULL",
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      charged_to: { type: Sequelize.ENUM("COMPANY", "USER"), allowNull: false },
      charged_to_user_id: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" } },
      created_by_user_id: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "id" } },
      profit_statement_id: statementRef,
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });
    await queryInterface.addIndex("expenses", ["company_id", "expense_date"], { name: "expenses_company_date" });

    // Existing Account Holder invoices: the average AH rate locked on their own orders, else today's saved rate.
    await q.query(`
      UPDATE invoices i SET pkr_rate = sub.rate
      FROM (
        SELECT o.account_holder_invoice_id AS id, AVG((o.exchange_rates ->> inv.currency)::numeric) AS rate
        FROM orders o JOIN invoices inv ON inv.id = o.account_holder_invoice_id
        WHERE o.exchange_rates ? inv.currency
        GROUP BY o.account_holder_invoice_id
      ) sub
      WHERE i.id = sub.id AND i.role = 'ACCOUNT_HOLDER'
    `);
    await q.query(`
      UPDATE invoices i SET pkr_rate = r.rate
      FROM exchange_rates r
      WHERE i.role = 'ACCOUNT_HOLDER' AND i.pkr_rate IS NULL AND r.currency = i.currency
    `);
    await q.query(`UPDATE invoices SET pkr_rate = 1 WHERE pkr_rate IS NULL AND currency = 'PKR'`);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("expenses");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_expenses_charged_to"`);
    await queryInterface.dropTable("expense_categories");
    await queryInterface.removeColumn("invoices", "pkr_rate");
    await queryInterface.removeColumn("invoices", "profit_statement_id");
    await queryInterface.removeColumn("orders", "refund_profit_statement_id");
    await queryInterface.removeColumn("orders", "profit_statement_id");
    await queryInterface.dropTable("profit_statements");
    await queryInterface.removeColumn("companies", "last_profit_statement_sequence");
    await queryInterface.removeColumn("companies", "profit_opening_cycle_start");
    await queryInterface.removeColumn("companies", "profit_opening_balance");
    await queryInterface.removeColumn("companies", "admin_profit_percent");
    await queryInterface.removeColumn("staff_profiles", "can_manage_profit_statements");
    await queryInterface.renameColumn("staff_profiles", "partner_percent", "share_percent");
    await queryInterface.renameColumn("staff_profiles", "is_partner", "has_revenue_share");
  },
};
