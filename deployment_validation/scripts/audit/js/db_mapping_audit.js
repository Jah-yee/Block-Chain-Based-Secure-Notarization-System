const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log('--- Database Mapping Audit ---');

        // List all tables
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('TABLES:', tables.rows.map(r => r.table_name));

        // For each table, get column names and count records
        for (const table of tables.rows) {
            const tableName = table.table_name;
            const cols = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [tableName]);
            const count = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);

            console.log(`\nTable: ${tableName} (${count.rows[0].count} records)`);
            console.log('Columns:', cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
        }

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
