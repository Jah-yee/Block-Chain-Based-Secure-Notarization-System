const pool = require('./src/db/index');
async function run() {
  try {
    console.log("--- CONSTRAINT STABILIZATION START ---");
    
    // 1. Drop existing constraint
    console.log("Dropping old 'check_role_valid'...");
    try {
      await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role_valid');
    } catch (e) { console.warn("Note (Drop):", e.message); }

    // 2. Add new expanded constraint
    console.log("Adding new 'check_role_valid' including 'owner'...");
    await pool.query(`
      ALTER TABLE users 
      ADD CONSTRAINT check_role_valid 
      CHECK (role IN ('admin', 'user', 'notary', 'owner', 'notary_admin'))
    `);

    console.log("--- Constraint Stabilization Complete ---");
    
    // 3. Final Verification
    const res = await pool.query(`
      SELECT pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conname = 'check_role_valid';
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
