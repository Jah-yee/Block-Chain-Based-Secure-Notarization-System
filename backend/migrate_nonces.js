const pool = require('./src/db/index');

async function migrate() {
  try {
    console.log("Starting Migration: Adding 'purpose' to wallet_nonces...");
    
    // 1. Add purpose column if it doesn't exist
    await pool.query(`
      ALTER TABLE wallet_nonces 
      ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) DEFAULT 'LOGIN'
    `);
    
    // 2. Add index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_nonces_lookup 
      ON wallet_nonces(wallet_address, purpose, used_at, expiry)
    `);

    console.log("Migration Successful.");
    process.exit(0);
  } catch (err) {
    console.error("Migration Failed:", err);
    process.exit(1);
  }
}

migrate();
