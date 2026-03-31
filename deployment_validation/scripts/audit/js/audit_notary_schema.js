const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        const r = await pool.query(`
            SELECT column_name, is_nullable, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'notary_applications'
        `);
        console.log(JSON.stringify(r.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
