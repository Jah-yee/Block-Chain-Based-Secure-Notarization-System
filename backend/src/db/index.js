const pkg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ override: true });

const { Pool } = pkg;

let poolConfig;

if (!process.env.DATABASE_URL) {
  throw new Error("❌ [DATABASE_FATAL] DATABASE_URL is required. Refusing to start in unconfigured state.");
}

poolConfig = { connectionString: process.env.DATABASE_URL };

const pool = new Pool({
  ...poolConfig,
  max: 100, // High capacity for stress testing
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

module.exports = pool;
