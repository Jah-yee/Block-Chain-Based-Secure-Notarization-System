const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/bbsns_test_db',
});

pool.query('TRUNCATE TABLE pgmigrations')
  .then(() => console.log('Migrations table truncated'))
  .catch(err => console.log('Error:', err.message))
  .finally(() => pool.end());
