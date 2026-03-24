const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log('Starting migration...');

        // 1. Add ntkr_balance to users
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS ntkr_balance DECIMAL DEFAULT 0;
        `);
        console.log('- Added ntkr_balance to users');

        // 2. Add approval/rejection tx_hash to documents
        await pool.query(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS approval_tx_hash VARCHAR(66),
            ADD COLUMN IF NOT EXISTS rejection_tx_hash VARCHAR(66),
            ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
        `);
        console.log('- Added tx_hash and is_deleted columns to documents');

        // 3. Optional: Initialize some NTKR for the admin/user for testing
        await pool.query(`
            UPDATE users SET ntkr_balance = 100 WHERE email = 'admin@bbsns.com';
            UPDATE users SET ntkr_balance = 100 WHERE id = 5; -- User 5
        `);
        console.log('- Initialized test balances');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

run();
