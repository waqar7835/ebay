require("ts-node/register");
require("dotenv").config();

const ssl = { ssl: { require: true, rejectUnauthorized: false } };

// Mirrors database.module.ts: DB_SSL=true (e.g. Neon) turns on SSL for the CLI too.
const base = {
  use_env_variable: "DATABASE_URL",
  dialect: "postgres",
  ...(process.env.DB_SSL === "true" ? { dialectOptions: ssl } : {}),
};

module.exports = {
  development: base,
  test: base,
  production: {
    ...base,
    dialectOptions: ssl,
  },
};
