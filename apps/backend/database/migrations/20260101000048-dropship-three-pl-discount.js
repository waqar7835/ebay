"use strict";

// Dropship 3PL discount (decided 2026-10-27): a DROPSHIP 3PL is paid its entered buy price minus a per-3PL % (default
// 10). The % is locked on the order when its 3PL is set (orders.three_pl_discount_percent; null = 0, STOCK orders and
// dropship orders already on a 3PL invoice). Open dropship orders take their 3PL's % now and get their 3PL payout
// recomputed: Σ round2(line buy total × (1 − % / 100)), in the 3PL's currency, then to PKR with the order's rate.
const round2 = (v) => Math.round(v * 100) / 100;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("three_pl_profiles", "dropship_discount_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 10,
    });
    await queryInterface.addColumn("orders", "three_pl_discount_percent", { type: Sequelize.DECIMAL(5, 2), allowNull: true });

    const [orders] = await queryInterface.sequelize.query(`
      SELECT o.id, o.three_pl_currency, o.exchange_rates, o.three_pl_payout_original, tp.dropship_discount_percent AS pct
      FROM orders o
      JOIN three_pl_profiles tp ON tp.user_id = o.three_pl_id
      WHERE o.three_pl_invoice_id IS NULL
        AND EXISTS (
          SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = o.id AND p.fulfillment_type = 'DROPSHIP'
        )
    `);
    for (const order of orders) {
      const [items] = await queryInterface.sequelize.query(
        `SELECT buy_total_original, buy_total_snapshot FROM order_items WHERE order_id = :id`,
        { replacements: { id: order.id } },
      );
      const keep = 1 - Number(order.pct) / 100;
      const net = (totals) =>
        totals.length && totals.every((t) => t != null) ? round2(totals.reduce((s, t) => s + round2(Number(t) * keep), 0)) : null;
      let original = null;
      let snapshot;
      if (!order.exchange_rates) {
        // Pre-currency order: plain PKR in the snapshots (originals untouched).
        original = order.three_pl_payout_original;
        snapshot = net(items.map((i) => i.buy_total_snapshot));
      } else {
        original = order.three_pl_currency ? net(items.map((i) => i.buy_total_original)) : null;
        const rate = order.three_pl_currency ? order.exchange_rates[order.three_pl_currency] : null;
        snapshot = original != null && rate ? round2(original * Number(rate)) : null;
      }
      await queryInterface.sequelize.query(
        `UPDATE orders SET three_pl_discount_percent = :pct, three_pl_payout_original = :original, three_pl_payout_snapshot = :snapshot WHERE id = :id`,
        { replacements: { id: order.id, pct: order.pct, original, snapshot } },
      );
    }
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("orders", "three_pl_discount_percent");
    await queryInterface.removeColumn("three_pl_profiles", "dropship_discount_percent");
  },
};
