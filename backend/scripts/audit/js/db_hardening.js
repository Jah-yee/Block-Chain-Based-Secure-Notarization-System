const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        console.log('Hardening Database...');

        // 1. Enforce that 'approved' status MUST have a tx_hash
        // This prevents manual DB overrides without blockchain anchors
        await pool.query(`
            ALTER TABLE documents 
            DROP CONSTRAINT IF EXISTS enforce_tx_on_approval;
            
            ALTER TABLE documents
            ADD CONSTRAINT enforce_tx_on_approval 
            CHECK (
                (status != 'approved') OR 
                (approval_tx_hash IS NOT NULL AND status = 'approved' AND approval_tx_hash ~ '^0x[a-fA-F0-9]{64}$')
            );
        `);
        console.log('- Added transaction anchor constraint to documents table');

        // 2. Index on lower(wallet_address) for faster unique checks
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_wallet_lower ON users (LOWER(wallet_address));
        `);
        console.log('- Added functional index on lower(wallet_address)');

    } catch (err) {
        console.error('Hardening failed:', err);
    } finally {
        await pool.end();
    }
}

run();
