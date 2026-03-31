const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

async function lifecycle() {
    const adminClient = new Client({
        connectionString: 'postgres://postgres:postgres@localhost:5432/postgres' // System DB
    });

    try {
        await adminClient.connect();
        
        console.log('🏗️  Phase 1.2: Migration Validation (Fresh DB)');
        
        // 1. Drop existing test DB if any
        await adminClient.query('DROP DATABASE IF EXISTS notarydb_test');
        console.log('✅ Dropped existing notarydb_test');

        // 2. Create fresh test DB
        await adminClient.query('CREATE DATABASE notarydb_test');
        console.log('✅ Created fresh notarydb_test');

    } catch (err) {
        console.error('❌ Lifecycle Error:', err.message);
    } finally {
        await adminClient.end();
    }
}

lifecycle();
