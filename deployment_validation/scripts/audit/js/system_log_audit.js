const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb",
});

async function run() {
    try {
        console.log('--- System Logs Columns ---');
        const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'system_logs'");
        console.log('COLUMNS:', JSON.stringify(cols.rows.map(c => c.column_name)));

        // 2. Search for all logs related to notary or application ordering by first available column
        // We'll iterate through likely timestamp columns if 'timestamp' is missing.
        const timeCol = cols.rows.some(c => c.column_name === 'timestamp') ? 'timestamp' :
            cols.rows.some(c => c.column_name === 'created_at') ? 'created_at' :
                cols.rows[0].column_name;

        const logs = await pool.query(`SELECT * FROM system_logs WHERE message ILIKE '%notary%' OR message ILIKE '%application%' ORDER BY ${timeCol} DESC`);
        console.log('LOGS:', JSON.stringify(logs.rows, null, 2));

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
