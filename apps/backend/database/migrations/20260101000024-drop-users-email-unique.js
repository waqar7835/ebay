"use strict";

// Portal users can now hold one account row per role (Staff, Account Holder, Stock Owner, 3PL),
// all sharing the same email; uniqueness is enforced per (email, role) at the application level
// instead of a single global unique constraint on email.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeConstraint("users", "users_email_key");
    await queryInterface.addIndex("users", ["email"]);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex("users", ["email"]);
    await queryInterface.addConstraint("users", {
      fields: ["email"],
      type: "unique",
      name: "users_email_key",
    });
  },
};
