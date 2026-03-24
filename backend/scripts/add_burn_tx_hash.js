require('dotenv').config({ path: '../.env' });
const pool = require("../src/db/index");

async function migrate() {
    console.log("Migrating DB: Adding burn_tx_hash column...");
    try {
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS burn_tx_hash VARCHAR(66)");
        console.log("✅ Column `burn_tx_hash` added successfully.");
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
    }
    process.exit(0);
}

migrate();
