const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });

async function run() {
  try {
    const res = await pool.query("SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'users'");
    console.log('--- SCHEMA START ---');
    res.rows.forEach(r => {
      console.log(`COLUMN: ${r.column_name} | NULLABLE: ${r.is_nullable} | DEFAULT: ${r.column_default}`);
    });
    console.log('--- SCHEMA END ---');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
