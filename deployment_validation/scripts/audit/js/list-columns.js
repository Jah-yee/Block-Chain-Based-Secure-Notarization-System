const { Pool } = require('pg');
require('dotenv').config();

async function listColumns() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'documents';");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
listColumns();
