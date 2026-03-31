const pool = require('./src/db/index');

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type, ordinal_position
      FROM information_schema.columns 
      WHERE table_name = 'notary_applications'
      ORDER BY ordinal_position
    `);
        console.log("Schema for notary_applications:");
        res.rows.forEach(row => console.log(`${row.ordinal_position}: ${row.column_name} (${row.data_type})`));
        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

checkSchema();
