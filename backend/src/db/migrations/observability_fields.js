const pool = require('../index');

async function migrate() {
    const queries = [
        // Update Documents table
        `ALTER TABLE documents ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
        `ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_error JSONB;`,
        `ALTER TABLE documents ADD COLUMN IF NOT EXISTS correlation_id TEXT;`,
        `ALTER TABLE documents ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;`,
        
        // Update Users table (for identity sync observability)
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_error JSONB;`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS correlation_id TEXT;`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;`
    ];

    try {
        for (const sql of queries) {
            await pool.query(sql);
        }
        console.log('✅ Observability columns added to documents and users tables.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
