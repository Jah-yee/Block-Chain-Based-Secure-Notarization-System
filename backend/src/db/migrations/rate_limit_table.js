const pool = require('../index');

async function migrate() {
    const sql = `
        CREATE TABLE IF NOT EXISTS rate_limits (
            key TEXT PRIMARY KEY,
            count INT DEFAULT 0,
            reset_at TIMESTAMP,
            violations INT DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(sql);
        console.log('✅ rate_limits table created or already exists');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
