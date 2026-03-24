const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });
async function main() {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='ntkr_transactions' AND table_schema='public' ORDER BY ordinal_position");
  console.log('ntkr_transactions columns:', r.rows.map(x => x.column_name).join(', '));
  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
