const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

async function reset() {
  try {
    console.log('🔍 Identifying tables for reset...');
    const res = await pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
    const tables = res.rows.map(r => r.tablename);
    
    if (tables.length === 0) {
      console.log('ℹ️ No tables found to reset.');
      process.exit(0);
    }

    console.log(`🚮 Truncating tables: ${tables.join(', ')}...`);
    const truncateQuery = `TRUNCATE ${tables.join(', ')} CASCADE`;
    await pool.query(truncateQuery);
    
    console.log('✅ All tables reset successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  }
}
reset();
