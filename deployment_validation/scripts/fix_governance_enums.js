const pool = require("../src/db/index");

async function fixEnums() {
    try {
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

fixEnums();
