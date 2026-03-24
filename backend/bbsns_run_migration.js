const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('\n██████ UPLOAD INTENTS MIGRATION — START ██████\n');
  const sql = fs.readFileSync(path.join(__dirname, 'migrations/20260320_upload_intents.sql'), 'utf8');
  
  try {
    await pool.query(sql);
    console.log('✅ Migration applied successfully');

    // Verify
    const t = await pool.query(`SELECT to_regclass('public.upload_intents') as t`);
    if (t.rows[0].t) console.log('✅ upload_intents table exists');
    else console.error('❌ upload_intents table MISSING');

    const c = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='documents' AND column_name='payment_tx_hash' AND table_schema='public'
    `);
    if (c.rows.length > 0) console.log('✅ documents.payment_tx_hash column exists');
    else console.error('❌ documents.payment_tx_hash column MISSING');

    console.log('\n🏆 MIGRATION COMPLETE\n');
  } catch(e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
