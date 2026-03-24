const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        for (const r of tables.rows) {
            const table = r.table_name;
            const cols = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);

            console.log(`\n--- TABLE: ${table} ---`);
            console.log('COLUMNS:', cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));

            try {
                const sample = await pool.query(`SELECT * FROM ${table} LIMIT 1`);
                if (sample.rows.length > 0) {
                    console.log('SAMPLE ROW:', JSON.stringify(sample.rows[0], null, 2));
                } else {
                    console.log('SAMPLE ROW: (Empty table)');
                }
            } catch (e) {
                console.log('SAMPLE ROW: (Error fetching sample)');
            }
        }
    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
