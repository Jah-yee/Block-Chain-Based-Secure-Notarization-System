jest.setTimeout(30000); // Increase Jest timeout to 30 seconds

// Set test database URL - Use the same host/port/auth as the main DB but a different DB name
const mainUrl = process.env.DATABASE_URL || 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb';
const urlParts = mainUrl.match(/postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\//);
const [_, user, password, host, port] = urlParts || [null, 'bbsns_user', 'bbsns_pass', 'localhost', '5433'];

process.env.DATABASE_URL = `postgres://${user}:${password}@${host}:${port}/bbsns_test_db`;

const { Pool } = require('pg');
const { execSync } = require('child_process');
const dbPool = require('../db');

// Create a pool for the default postgres database to create the test DB
const defaultPool = new Pool({
  host,
  port,
  user,
  password,
  database: 'postgres', // Connect to default postgres DB
});

// Create test pool
const testPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create test database before all tests
beforeAll(async () => {
  try {
    // Drop test database if it exists
    await defaultPool.query('DROP DATABASE IF EXISTS bbsns_test_db');
    // Create test database if it doesn't exist
    await defaultPool.query('CREATE DATABASE bbsns_test_db');
  } catch (err) {
    // Database might already exist, ignore
  } finally {
    await defaultPool.end();
  }

  // Run migrations on the new database
  // Explicitly set DATABASE_URL in the command to avoid any dotenv override
  const migrateCmd = `npx node-pg-migrate up --database-url "${process.env.DATABASE_URL}"`;
  console.log(`Running migrations: ${migrateCmd}`);
  execSync(migrateCmd, { stdio: 'inherit' });
});

// Clean up after each test
afterEach(async () => {
  const client = await testPool.connect();
  try {
    await client.query('DELETE FROM wallet_nonces');
    await client.query('DELETE FROM ntkr_transactions');
    await client.query('DELETE FROM documents');
    await client.query('DELETE FROM users');
    // Reset sequences
    await client.query('ALTER SEQUENCE wallet_nonces_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE documents_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE ntkr_transactions_id_seq RESTART WITH 1');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    client.release();
  }
});

// Close pools after all tests
afterAll(async () => {
  await testPool.end();
  await dbPool.end();
});

// Export test pool for use in tests
global.testPool = testPool;
