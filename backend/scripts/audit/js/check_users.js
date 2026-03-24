const pool = require('./src/db/index');
(async () => {
    const r = await pool.query("SELECT id, username, role, wallet_address, national_id_hash FROM users WHERE role = 'notary'");
    console.log('Notaries:', r.rows);
    process.exit(0);
})();
