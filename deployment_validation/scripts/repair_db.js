const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_nonce TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notary_pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN DEFAULT false;
`;

async function repair() {
  console.log('🛡️ [GUARDIAN] Initiating Schema Integrity Repair...');
  try {
    await pool.query(sql);
    console.log('✅ [GUARDIAN] Schema Repair Successful. Foundational columns restored.');
  } catch (err) {
    console.error('❌ [GUARDIAN] Repair Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

repair();
