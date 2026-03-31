const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb",
});

async function run() {
    try {
        console.log('--- DATABASE DATA SEARCH ---');

        // 1. Check all proposals
        const props = await pool.query('SELECT * FROM governance_proposals');
        console.log('GOVERNANCE PROPOSALS:', JSON.stringify(props.rows, null, 2));

        // 2. Check all applications (but look for any record that might have been hidden)
        const apps = await pool.query('SELECT * FROM notary_applications');
        console.log('NOTARY APPLICATIONS:', JSON.stringify(apps.rows, null, 2));

        // 3. Check all users (especially role=notary or name like %)
        const users = await pool.query('SELECT * FROM users');
        console.log('ALL USERS:', JSON.stringify(users.rows, null, 2));

        // 4. Check for any record with "license" or "number" in any text field
        // We'll search in notary_applications specifically for anything that isn't null and isn't what I set.
        const authSearch = await pool.query("SELECT * FROM notary_applications WHERE license_number IS NOT NULL AND license_number NOT LIKE 'BBSNS-NY%'");
        console.log('POTENTIAL AUTHENTIC LICENSES:', JSON.stringify(authSearch.rows, null, 2));

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await pool.end();
    }
}

run();
