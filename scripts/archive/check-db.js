const { Pool } = require('c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/node_modules/pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });

async function check() {
    try {
        console.log('--- USERS ---');
        const usersRes = await pool.query('SELECT id, email, role, wallet_address, role_tx_status, role_tx_hash, role_retry_count FROM users');
        console.table(usersRes.rows);

        console.log('--- NOTARY APPLICATIONS ---');
        const appsRes = await pool.query('SELECT id, email, status, wallet_address, is_activated FROM notary_applications');
        console.table(appsRes.rows);

    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await pool.end();
    }
}

check();
