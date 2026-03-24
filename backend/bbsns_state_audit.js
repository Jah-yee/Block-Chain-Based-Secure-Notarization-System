const pool = require('./src/db/index');

async function run() {
  try {
    console.log('\n=== BBSNS SYSTEM STATE AUDIT ===\n');

    // 1. Users
    const users = await pool.query('SELECT id, name, email, wallet_address, role, is_active, is_banned, ntkr_balance FROM users ORDER BY id');
    console.log('--- USERS ---');
    users.rows.forEach(u => console.log(JSON.stringify(u)));

    // 2. Remote auth sessions schema
    const cols = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name='remote_auth_sessions' AND table_schema='public'
      ORDER BY ordinal_position
    `);
    console.log('\n--- remote_auth_sessions SCHEMA ---');
    cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (default: ${c.column_default})`));

    // 3. Notary applications
    const apps = await pool.query('SELECT id, status, wallet_address, email, full_name FROM notary_applications ORDER BY id');
    console.log('\n--- NOTARY APPLICATIONS ---');
    apps.rows.forEach(a => console.log(JSON.stringify(a)));

    // 4. Notary count
    const nc = await pool.query("SELECT COUNT(*) as count FROM users WHERE role='notary'");
    console.log(`\n--- NOTARY COUNT in DB: ${nc.rows[0].count} ---`);

    // 5. Admin count
    const ac = await pool.query("SELECT COUNT(*) as count FROM users WHERE role='admin'");
    console.log(`--- ADMIN COUNT in DB: ${ac.rows[0].count} ---`);

    // 6. Documents
    const docs = await pool.query('SELECT id, user_id, submission_state, payment_tx_hash FROM documents ORDER BY id DESC LIMIT 5');
    console.log('\n--- RECENT DOCUMENTS ---');
    docs.rows.forEach(d => console.log(JSON.stringify(d)));

    // 7. upload_intents
    const intents = await pool.query('SELECT id, status, expires_at FROM upload_intents ORDER BY created_at DESC LIMIT 5');
    console.log('\n--- RECENT UPLOAD_INTENTS ---');
    intents.rows.forEach(i => console.log(JSON.stringify(i)));

    // 8. Check documents table has payment_tx_hash
    const ptx = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='documents' AND column_name='payment_tx_hash' AND table_schema='public'
    `);
    console.log(`\n--- documents.payment_tx_hash exists: ${ptx.rows.length > 0} ---`);

    console.log('\n=== AUDIT COMPLETE ===\n');
  } catch(e) {
    console.error('AUDIT ERROR:', e.message);
  } finally {
    await pool.end();
  }
}
run();
