const pool = require('./src/db/index');

async function run() {
    try {
        const u = await pool.query('SELECT id, email, wallet_address, role, national_id_hash FROM users');
        console.log('USERS:', JSON.stringify(u.rows, null, 2));

        const n = await pool.query('SELECT wallet_address, nonce, created_at, used_at FROM wallet_nonces ORDER BY created_at DESC LIMIT 10');
        console.log('RECENT NONCES:', JSON.stringify(n.rows, null, 2));

        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
