const pool = require('./src/db/index');
async function run() {
  try {
    console.log("--- ENUM STABILIZATION START ---");
    
    // Postgres doesn't allow ALTER TYPE ... ADD VALUE inside a transaction block easily
    // So we run them individually
    
    try {
      console.log("Adding 'pass' to kyc_status_enum...");
      await pool.query("ALTER TYPE kyc_status_enum ADD VALUE IF NOT EXISTS 'pass'");
    } catch (e) { console.warn("Note:", e.message); }

    try {
      console.log("Adding 'not_started' to kyc_status_enum...");
      await pool.query("ALTER TYPE kyc_status_enum ADD VALUE IF NOT EXISTS 'not_started'");
    } catch (e) { console.warn("Note:", e.message); }

    try {
      console.log("Adding 'PENDING_KYC' to identity_state_enum if it exists...");
      // Check if identity_state is an enum or varchar (previous audit said USER-DEFINED for some, VARCHAR for others)
      await pool.query("ALTER TYPE identity_state_enum ADD VALUE IF NOT EXISTS 'PENDING_KYC'");
    } catch (e) { console.warn("Note (Identity State):", e.message); }

    console.log("--- ENUM Stabilization Complete ---");
    
    // Final Audit
    const res = await pool.query(`
      SELECT n.nspname as schema, t.typname as type, e.enumlabel as value 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      JOIN pg_namespace n ON n.oid = t.typnamespace 
      WHERE t.typname IN ('kyc_status_enum', 'identity_state_enum')
      ORDER BY type, value;
    `);
    console.log(JSON.stringify(res.rows, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
