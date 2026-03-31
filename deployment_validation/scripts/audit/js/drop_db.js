const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'bbsns_user',
  password: 'bbsns_pass',
  database: 'postgres',
});

pool.query(`
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'bbsns_test_db';
`)
  .then(() => pool.query('DROP DATABASE IF EXISTS bbsns_test_db'))
  .then(() => console.log('DB dropped'))
  .catch(err => console.log('Error:', err.message))
  .finally(() => pool.end());
