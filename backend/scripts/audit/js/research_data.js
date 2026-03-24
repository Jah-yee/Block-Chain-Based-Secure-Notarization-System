const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb",
});

async function run() {
    try {
        console.log('--- Searching for Real Notary Data ---');

        // 1. All Users
        const users = await pool.query('SELECT id, username, name, email, role, wallet_address FROM users');
        console.log('USERS:', JSON.stringify(users.rows, null, 2));

        // 2. All Applications
        const apps = await pool.query('SELECT * FROM notary_applications');
        console.log('APPLICATIONS:', JSON.stringify(apps.rows, null, 2));

        // 3. Proposals related to the notary wallet
        const wallet = '0xa82a6fcbb2db5979a6fcca83c24317605580310e';
        const proposals = await pool.query("SELECT * FROM governance_proposals WHERE target_id LIKE '%' || $1 || '%'", [wallet]);
        console.log('PROPOSALS FOR WALLET:', JSON.stringify(proposals.rows, null, 2));

        // 4. Any system logs mentioning the wallet or notary
        const logs = await pool.query("SELECT * FROM system_logs WHERE message LIKE '%' || $1 || '%' OR message LIKE '%notary%' ORDER BY timestamp DESC LIMIT 20", [wallet]);
        console.log('LOGS:', JSON.stringify(logs.rows, null, 2));

    } catch (err) {
        console.error('Research failed:', err);
    } finally {
        await pool.end();
    }
}

run();
