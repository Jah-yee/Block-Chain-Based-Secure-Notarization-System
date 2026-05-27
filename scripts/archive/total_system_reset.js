const { Pool } = require('./backend/node_modules/pg');
const fs = require('fs');
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });


const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const reset = async () => {
    console.log("🧨 STARTING TOTAL SYSTEM RESET...");

    const tables = [
        'notary_applications',
        'documents',
        'governance_votes',
        'governance_proposals',
        'system_config_history',
        'users'
    ];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        for (const table of tables) {
            console.log(`   - Truncating ${table}...`);
            await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        }

        console.log("   ✅ All operational tables cleared.");
        await client.query('COMMIT');
        
        console.log("\n✨ SYSTEM RESET SUCCESSFUL.");
        console.log("👉 Next Step: Run your First Admin seeding script to gain access.");
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Reset Failed:", err);
        process.exit(1);
    } finally {
        client.release();
    }
};

reset().catch(err => {
    console.error(err);
    process.exit(1);
});
