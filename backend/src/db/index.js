const pkg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ override: true });

const { Pool } = pkg;

let poolConfig;

if (process.env.DATABASE_URL) {
  poolConfig = { connectionString: process.env.DATABASE_URL };
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'bbsns_user',
    password: process.env.DB_PASSWORD || 'bbsns_pass',
    database: process.env.DB_NAME || 'bbsns_db',
    port: process.env.DB_PORT || 5432,
  };
}

const pool = new Pool(poolConfig);

module.exports = pool;
