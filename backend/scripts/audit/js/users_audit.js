const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('USERS COLUMNS:', JSON.stringify(result.rows, null, 2));
    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
