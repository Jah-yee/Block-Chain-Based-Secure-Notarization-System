const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});
async function check() {
  const res = await pool.query('SELECT COUNT(*) FROM users');
  console.log('USER_COUNT:' + res.rows[0].count);
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('TABLES:' + tables.rows.map(r => r.table_name).join(', '));
  process.exit(0);
}
check().catch(err => { console.error(err); process.exit(1); });
