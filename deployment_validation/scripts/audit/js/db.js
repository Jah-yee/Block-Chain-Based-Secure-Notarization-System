const { Pool } = require("pg");

const isTest = process.env.NODE_ENV === 'test';

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST || "postgres",
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || "bbsns_user",
    password: process.env.DB_PASSWORD || "bbsns_pass",
    database: isTest ? (process.env.DB_NAME_TEST || "bbsns_test_db") : (process.env.DB_NAME || "bbsns_db"),
  });
}

if (!isTest) {
  pool.connect()
    .then(() => console.log("✅ Connected to Postgres"))
    .catch(err => console.error("❌ Postgres connection error:", err));
}

module.exports = pool;
