const pool = require('./src/db/index');
async function run() {
  try {
    console.log("--- USERS STABILIZATION START ---");
    
    // 1. Face Liveness Resolution
    console.log("Injecting 'face_descriptor'...");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor TEXT');
    
    // 2. Identity State Resolution
    console.log("Injecting 'identity_state'...");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_state VARCHAR(50) DEFAULT \'PENDING_KYC\'');
    
    // 3. Status Synchronization
    console.log("Ensuring liveness/kyc columns exist...");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS liveness_status VARCHAR(50) DEFAULT \'not_started\'');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_nonce TEXT');
    
    console.log("--- Users table aligned successfully ---");
    
    // 4. Final Verification
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('face_descriptor', 'identity_state', 'liveness_status', 'kyc_verified', 'wallet_nonce')
    `);
    console.log("Final Audit Result:");
    console.log(JSON.stringify(res.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error("--- STABILIZATION FATAL ERROR ---");
    console.error(err);
    process.exit(1);
  }
}
run();
