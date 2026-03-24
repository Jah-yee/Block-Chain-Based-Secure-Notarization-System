const pool = require('./src/db/index');
async function migration() {
    try {
        await pool.query("ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS execution_tx_hash VARCHAR(255)");
        console.log('✅ Column execution_tx_hash added successfully');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}
migration();
