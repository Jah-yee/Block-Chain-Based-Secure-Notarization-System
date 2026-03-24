const pool = require('./src/db/index');

async function run() {
  try {
    console.log('Action: Creating relayer_nonces table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS relayer_nonces (
        wallet_address TEXT PRIMARY KEY,
        nonce          BIGINT NOT NULL DEFAULT 0,
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ TABLE CREATED: relayer_nonces');
  } catch (err) {
    console.error('❌ MIGRATION ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

run();
