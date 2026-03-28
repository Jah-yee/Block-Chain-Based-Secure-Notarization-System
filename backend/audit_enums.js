const pool = require('./src/db/index');
async function run() {
  try {
    console.log("--- ENUM AUDIT START ---");
    const res = await pool.query(`
      SELECT n.nspname as schema, t.typname as type, e.enumlabel as value 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      JOIN pg_namespace n ON n.oid = t.typnamespace 
      WHERE t.typname IN ('kyc_status_enum', 'identity_state_enum')
      ORDER BY type, value;
    `);
    console.log("Found ENUM values:");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
