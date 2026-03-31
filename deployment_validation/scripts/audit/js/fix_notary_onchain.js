const pool = require('./src/db/index');
const { registerNotaryOnChain } = require('./src/blockchain/notary-registry');

async function fix() {
    const email = 'notary@bbsns.com';
    console.log(`Self-Repair for notary: ${email}`);

    try {
        const result = await pool.query('SELECT wallet_address FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            console.error('User not found in DB');
            process.exit(1);
        }

        const wallet = result.rows[0].wallet_address;
        await registerNotaryOnChain(wallet);
        console.log('✅ Synchronized successfully.');
    } catch (e) {
        console.error('Repair Failed:', e);
    }
    process.exit(0);
}

fix();
