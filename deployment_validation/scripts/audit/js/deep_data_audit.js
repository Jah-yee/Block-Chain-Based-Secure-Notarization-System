const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb",
});

async function run() {
    try {
        console.log('--- Deep Data Search ---');

        // 1. Search documents for filenames or notes related to licenses
        const docs = await pool.query("SELECT * FROM documents WHERE filename ILIKE '%license%' OR filename ILIKE '%notary%' OR filename ILIKE '%shubham%' OR filename ILIKE '%mate%'");
        console.log('DOCUMENTS:', JSON.stringify(docs.rows, null, 2));

        // 2. Search notary_applications but specifically for ANY record that might have a non-blank license
        // We'll also check for any record where name contains Shubham or Mate
        const apps = await pool.query("SELECT * FROM notary_applications WHERE full_name ILIKE '%Shubham%' OR full_name ILIKE '%Mate%' OR license_number IS NOT NULL");
        console.log('APPLICATIONS:', JSON.stringify(apps.rows, null, 2));

        // 3. Search users for anything else
        const users = await pool.query("SELECT * FROM users WHERE name ILIKE '%Shubham%' OR name ILIKE '%Mate%' OR username ILIKE '%Shubham%' OR username ILIKE '%Mate%'");
        console.log('USERS:', JSON.stringify(users.rows, null, 2));

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
