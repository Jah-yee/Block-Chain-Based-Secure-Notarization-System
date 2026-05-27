const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), override: true });
const pool = require("../src/db/index");
const dbContext = require("../src/db/context");

async function fixEnums() {
    try {
        pool.init();
        const types = ['add_admin', 'remove_admin', 'remove_notary', 'change_threshold'];
        for (const type of types) {
            console.log(`Adding ${type} to proposal_type...`);
            await pool.query(`ALTER TYPE proposal_type ADD VALUE IF NOT EXISTS '${type}'`);
        }
        console.log("✅ ENUMs updated successfully.");
    } catch (err) {
        console.error("Error updating ENUMs:", err.message);
    } finally {
        await pool.end();
    }
}

dbContext.run({
    userId: 0, // SYSTEM Actor ID
    actor: 'SYSTEM',
    actorId: 'SYSTEM_RESET',
    domain: 'SYSTEM',
    action: 'SYSTEM_BOOTSTRAP',
    requestId: `FIX_ENUM_${Date.now()}`,
    service: 'RESET_TOOL'
}, () => {
    fixEnums();
});
