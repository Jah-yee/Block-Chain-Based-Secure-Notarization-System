const pool = require('./src/db/index');
const fs = require('fs');
const path = require('path');

async function run() {
  const migrationPath = path.join(__dirname, 'migrations/20260324_task_consistency_v3.sql');
  console.log(`🚀 Executing Migration: ${migrationPath}`);
  
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    await pool.query(sql);
    console.log('✅ Phase 3 Consistency Migration applied successfully');
    
    // Quick verification
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'documents' AND column_name IN ('idempotency_key', 'tx_status', 'tx_hash')
    `);
    console.log('📊 Verification Results:', res.rows);
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
