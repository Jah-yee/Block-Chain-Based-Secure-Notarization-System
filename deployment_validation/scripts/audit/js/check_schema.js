const pool = require('./src/db/index');

async function checkTable() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'remote_gov_sessions'
    `);
        console.log("Columns in remote_gov_sessions:");
        res.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));

        if (res.rows.length === 0) {
            console.log("TABLE NOT FOUND!");
        }
        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

checkTable();
