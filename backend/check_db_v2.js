const pool = require('./src/db/index');
async function run() {
  try {
    const res = await pool.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('documents', 'users', 'wallet_nonces')
      ORDER BY table_name, column_name
    `);
    console.log("--- SCHEMA START ---");
    console.log(JSON.stringify(res.rows, null, 2));
    console.log("--- SCHEMA END ---");
    process.exit(0);
  } catch (err) {
    console.error("--- DB ERROR ---");
    console.error(err);
    process.exit(1);
  }
}
run();
