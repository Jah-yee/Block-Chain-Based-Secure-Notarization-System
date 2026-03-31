const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log('--- Reverting Notary Data ---');
        await pool.query('BEGIN');

        // Revert User #5 name
        await pool.query("UPDATE users SET name = 'Notary Public' WHERE id = 5");
        console.log('Reverted User #5 name');

        // Clear Application #1 details
        await pool.query(`
            UPDATE notary_applications 
            SET license_number = NULL, 
                nationality = NULL, 
                phone = NULL, 
                experience = NULL 
            WHERE id = 1
        `);
        console.log('Cleared Application #1 details');

        await pool.query('COMMIT');
        console.log('Transaction committed successfully');
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Reversion failed:', err);
    } finally {
        await pool.end();
    }
}

run();
