"use strict";

// An eBay order number may only be recorded once per company. Refs are trimmed first so
// " 12-345 " and "12-345" can't coexist; existing duplicates must be resolved by hand.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`UPDATE orders SET ebay_order_ref = TRIM(ebay_order_ref)`);
    const [dupes] = await queryInterface.sequelize.query(
      `SELECT company_id, ebay_order_ref, COUNT(*) AS n FROM orders
       GROUP BY company_id, ebay_order_ref HAVING COUNT(*) > 1`,
    );
    if (dupes.length) {
      throw new Error(
        `Duplicate eBay order numbers must be fixed before this migration: ${dupes
          .map((d) => `${d.ebay_order_ref} (x${d.n})`)
          .join(", ")}`,
      );
    }
    await queryInterface.addIndex("orders", ["company_id", "ebay_order_ref"], {
      unique: true,
      name: "orders_company_id_ebay_order_ref_unique",
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex("orders", "orders_company_id_ebay_order_ref_unique");
  },
};
