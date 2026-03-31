const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function migrate() {
    try {
        console.log('--- MIGRATING GOVERNANCE PROPOSALS ---');
        await pool.query(`
            ALTER TABLE governance_proposals 
            ADD COLUMN IF NOT EXISTS participation_scope VARCHAR(20) DEFAULT 'admin' 
            CHECK (participation_scope IN ('admin', 'notary', 'all'));
        `);
        console.log('[OK] participation_scope added.');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
}

migrate();
