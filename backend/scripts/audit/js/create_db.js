const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'bbsns_user',
  password: 'bbsns_pass',
  database: 'postgres',
});

pool.query('CREATE DATABASE bbsns_test_db')
  .then(() => console.log('DB created'))
  .catch(err => console.log('DB already exists or error:', err.message))
  .finally(() => pool.end());
