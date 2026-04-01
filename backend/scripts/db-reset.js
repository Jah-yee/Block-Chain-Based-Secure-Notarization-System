const { Client } = require('pg');
require('dotenv').config();

async function resetAndVerify() {
    console.log('🌋 TOTAL WIPE INITIATED...');
    
    const config = {
        user: 'bbsns_user',
        host: 'localhost',
        database: 'postgres',
        password: 'bbsns_pass',
        port: 5433,
    };

    const client = new Client(config);

    try {
        await client.connect();
        console.log('   - Connections terminated.');
        await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'notarydb' AND pid <> pg_backend_pid()");
        
        console.log('   - Dropping database notarydb...');
        await client.query('DROP DATABASE IF EXISTS notarydb');
        
        console.log('   - Recreating database notarydb...');
        await client.query('CREATE DATABASE notarydb');
        await client.end();

        // Verification Step (New Connection)
        console.log('   - Verifying clean slate...');
        const verifyClient = new Client({ ...config, database: 'notarydb' });
        await verifyClient.connect();
        const res = await verifyClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(`   - Tables found: ${res.rowCount}`);
        if (res.rowCount > 0) {
            console.warn('❌ [AUDIT_FAIL] Database is NOT clean after drop/create!');
            console.log(res.rows);
            process.exit(1);
        }
        await verifyClient.end();
        console.log('✅ [TOTAL_WIPE_SUCCESS] Database is 100% clean and ready for migrations.');
    } catch (err) {
        console.error('❌ [WIPE_FATAL] Error:', err.message);
        process.exit(1);
    }
}

resetAndVerify();
