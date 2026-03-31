const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

async function check() {
  try {
    const res = await pool.query("SELECT name, run_on FROM pg_migrations ORDER BY run_on DESC");
    console.log('🛡️ [GUARDIAN] Current Applied Migrations:');
    res.rows.forEach(row => console.log(`- ${row.name} (${row.run_on})`));
  } catch (err) {
    if (err.code === '42P01') {
      console.log('⚠️ [GUARDIAN] pg_migrations table does not exist. DB is uninitialized or uses a different runner.');
    } else {
      console.error('❌ [GUARDIAN] Query Failed:', err.message);
    }
  } finally {
    await pool.end();
  }
}

check();
