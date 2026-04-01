const { Client } = require('pg');
const migrate = require('node-pg-migrate').default;
const path = require('path');
require('dotenv').config();

async function deployFresh() {
    console.log('🌋 TOTAL WIPE & ATOMIC MIGRATION START...');

    const systemConfig = {
        connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/postgres'
    };

    const targetConfig = {
        connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
    };

    const systemClient = new Client(systemConfig);

    try {
        await systemClient.connect();
        console.log('   - Terminating existing connections...');
        await systemClient.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'notarydb' AND pid <> pg_backend_pid()");
        
        console.log('   - Dropping and Recreating notarydb...');
        await systemClient.query('DROP DATABASE IF EXISTS notarydb');
        await systemClient.query('CREATE DATABASE notarydb');
        await systemClient.end();

        console.log('   - Executing Atomic Migration Sequence...');
        const migrationResult = await migrate({
            databaseUrl: targetConfig.connectionString,
            dir: path.join(__dirname, '../migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            count: Infinity, // Apply all
            verbose: true
        });

        console.log(`✅ [DEPLOY_SUCCESS] ${migrationResult.length} migrations applied successfully.`);

        // Final Verification
        console.log('   - Verifying Final Structural Integrity...');
        const verifyClient = new Client(targetConfig);
        await verifyClient.connect();
        const tables = await verifyClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(`   - Tables recovered: ${tables.rowCount}`);
        await verifyClient.end();

    } catch (err) {
        console.error('❌ [DEPLOY_FATAL] Deployment failed:', err.message);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    }
}

deployFresh();
