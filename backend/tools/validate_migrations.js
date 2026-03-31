const { Client } = require('pg');
const path = require('path');

// HARDCODED LOCAL TEST CREDENTIALS (from docker-compose.yml)
const TEST_DB_URL = 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb_test';
const ADMIN_DB_URL = 'postgres://bbsns_user:bbsns_pass@localhost:5433/postgres';

async function validate() {
    const client = new Client({ connectionString: ADMIN_DB_URL });

    try {
        await client.connect();
        console.log('🔄 Phase 1.2: Migration Validation (Fresh DB)');
        
        await client.query('DROP DATABASE IF EXISTS notarydb_test');
        await client.query('CREATE DATABASE notarydb_test');
        console.log('✅ Fresh database notarydb_test created.');
        await client.end();

        // Dynamically import ES Module
        const { runner: migrate } = await import('node-pg-migrate');

        // Run migrations
        console.log('🚀 Running migrations on fresh DB...');
        await migrate({
            databaseUrl: TEST_DB_URL,
            dir: path.join(__dirname, '../migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            count: Infinity
        });
        console.log('✅ Migrations completed successfully on fresh DB.');

        // Run migrations on existing DB (idempotency check)
        console.log('🚀 Running migrations on existing DB (idempotency)...');
        await migrate({
            databaseUrl: TEST_DB_URL,
            dir: path.join(__dirname, '../migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            count: Infinity
        });
        console.log('✅ Idempotency check PASSED.');

    } catch (err) {
        console.log('--- ERROR DETAIL ---');
        console.log(err.message);
        if (err.stack) console.log(err.stack);
        process.exit(1);
    }
}

validate();
