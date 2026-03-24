const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });

async function run() {
  try {
    const res = await pool.query(`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND is_nullable = 'NO' 
      AND column_default IS NULL
    `);
    
    console.log('--- MANDATORY COLUMNS (NO DEFAULT) ---');
    res.rows.forEach(r => console.log(r.column_name));
    console.log('---------------------------------------');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
