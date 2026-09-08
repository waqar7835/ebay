require("ts-node/register");
require("dotenv").config();

const base = {
  use_env_variable: "DATABASE_URL",
  dialect: "postgres",
};

module.exports = {
  development: base,
  test: base,
  production: {
    ...base,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  },
};
