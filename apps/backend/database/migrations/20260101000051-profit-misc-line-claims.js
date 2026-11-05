"use strict";

// Profit statements claim each invoice misc line on its own (decided 2026-11-05): a misc line added to an UNPAID
// invoice after a statement counted that invoice's other misc lines is counted in the next open cycle.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("invoice_line_items", "profit_statement_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "profit_statements", key: "id" },
      onDelete: "SET NULL",
    });
    await queryInterface.sequelize.query(`
      UPDATE invoice_line_items l SET profit_statement_id = i.profit_statement_id
      FROM invoices i
      WHERE l.invoice_id = i.id AND l.kind = 'MISC' AND i.profit_statement_id IS NOT NULL
    `);
    await queryInterface.removeColumn("invoices", "profit_statement_id");
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("invoices", "profit_statement_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "profit_statements", key: "id" },
      onDelete: "SET NULL",
    });
    await queryInterface.sequelize.query(`
      UPDATE invoices i SET profit_statement_id = sub.ps
      FROM (SELECT invoice_id, MAX(profit_statement_id::text)::uuid AS ps FROM invoice_line_items
            WHERE profit_statement_id IS NOT NULL GROUP BY invoice_id) sub
      WHERE i.id = sub.invoice_id
    `);
    await queryInterface.removeColumn("invoice_line_items", "profit_statement_id");
  },
};
