const pool = require('./src/db/index');
async function run() {
  try {
    console.log("--- FORCE FIX START ---");
    
    // 1. Wallet Nonces Resolution
    console.log("Injecting 'purpose' into wallet_nonces...");
    await pool.query('ALTER TABLE wallet_nonces ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) DEFAULT \'LOGIN\'');
    
    // 2. User Table Stabilization
    console.log("Injecting 'is_banned' into users...");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE');
    
    // 3. Document Table Stabilization
    console.log("Injecting 'submission_state' into documents...");
    await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS submission_state VARCHAR(50) DEFAULT \'initiated\'');
    
    console.log("--- Schema injected successfully via Pool ---");
    
    // 4. Verification Check
    const res = await pool.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('wallet_nonces', 'users', 'documents') 
      AND column_name IN ('purpose', 'is_banned', 'submission_state')
    `);
    console.log("Confirmation Audit:");
    console.log(JSON.stringify(res.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error("--- FORCE FIX ERROR ---");
    console.error(err);
    process.exit(1);
  }
}
run();
