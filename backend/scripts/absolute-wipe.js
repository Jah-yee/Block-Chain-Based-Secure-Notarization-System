const { Client } = require('pg');
require('dotenv').config();

/**
 * 🌋 ABSOLUTE TOTAL WIPE
 * This script ensures the target database is DEAD and REBORN.
 */

async function absoluteWipe() {
    const targetUrl = process.env.DATABASE_URL;
    if (!targetUrl) throw new Error("DATABASE_URL missing from .env");

    console.log(`🌋 TARGET URL: ${targetUrl}`);
    
    // Parse the URL to get the system connection
    const parts = targetUrl.split('/');
    const dbName = parts.pop();
    const systemUrl = parts.join('/') + '/postgres';

    console.log(`   - System URL: ${systemUrl}`);
    console.log(`   - Target DB: ${dbName}`);

    const systemClient = new Client({ connectionString: systemUrl });

    try {
        await systemClient.connect();
        
        console.log(`   - Terminating all connections to ${dbName}...`);
        await systemClient.query(`
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE datname = $1 AND pid <> pg_backend_pid()
        `, [dbName]);

        console.log(`   - Dropping database ${dbName}...`);
        await systemClient.query(`DROP DATABASE IF EXISTS ${dbName}`);

        console.log(`   - Recreating database ${dbName}...`);
        await systemClient.query(`CREATE DATABASE ${dbName}`);
        
        await systemClient.end();

        // VALIDATION
        console.log(`   - Verifying REBORN state for ${dbName}...`);
        const verifyClient = new Client({ connectionString: targetUrl });
        await verifyClient.connect();
        const res = await verifyClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        
        console.log(`   - Tables in public schema: ${res.rowCount}`);
        if (res.rowCount > 0) {
            console.error('❌ [FATAL] Database is NOT empty! Tables found:', res.rows.map(r => r.table_name));
            process.exit(1);
        }
        
        await verifyClient.end();
        console.log('✅ [TOTAL_WIPE_SUCCESS] System is 100% clean and ready for Zero-State Validation.');
    } catch (err) {
        console.error('❌ [ABSOLUTE_WIPE_FAIL] Error:', err.message);
        process.exit(1);
    }
}

absoluteWipe();
