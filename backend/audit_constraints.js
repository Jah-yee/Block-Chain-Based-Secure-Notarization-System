const pool = require('./src/db/index');
async function run() {
  try {
    console.log("--- CONSTRAINT AUDIT START ---");
    const res = await pool.query(`
      SELECT pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conname = 'check_role_valid';
    `);
    console.log("Found constraint definition:");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
