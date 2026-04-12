require('dotenv').config({ path: 'backend/.env' });
const pool = require('../db/index.js');

async function fixEnum() {
    pool.init();
    const client = await pool.connect();
    try {
        console.log("🛠️ Starting Schema Fix: Notary Status Enum...");
        
        await client.query("ALTER TABLE notary_applications DROP CONSTRAINT IF EXISTS notary_applications_status_check");
        await client.query("ALTER TABLE notary_applications ADD CONSTRAINT notary_applications_status_check CHECK (status IN ('pending', 'APPLIED', 'KYC_VERIFIED', 'approved', 'rejected', 'activated'))");
        
        console.log("✅ Schema Fix Completed: 'activated' status now allowed.");
    } catch (err) {
        console.error("❌ Schema Fix Failed:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

fixEnum();
