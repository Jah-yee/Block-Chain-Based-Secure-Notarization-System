const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        const props = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'governance_proposals'
        `);
        console.log('PROPOSALS:', props.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));

        const votes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'governance_votes'
        `);
        console.log('VOTES:', votes.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
