const pool = require('./src/db/index');

async function reset() {
    const email = 'notary@bbsns.com';
    console.log(`Resetting notary: ${email} for re-testing...`);

    try {
        await pool.query('BEGIN');

        // 1. Get User ID
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

        if (userRes.rows.length > 0) {
            const userId = userRes.rows[0].id;
            console.log(`- Unlinking user account (ID: ${userId}) from applications...`);
            await pool.query('UPDATE notary_applications SET user_id = NULL WHERE user_id = $1', [userId]);

            console.log(`- Removing user account...`);
            await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }

        // 2. Reset application status to 'kyc_verified'
        console.log(`- Resetting application status to 'kyc_verified'...`);
        await pool.query("UPDATE notary_applications SET status = 'kyc_verified' WHERE email = $1", [email]);

        await pool.query('COMMIT');
        console.log('\n✅ Reset complete! You can now go to the Admin Dashboard and click "Approve" to test the automated on-chain registration.');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Reset Failed:', e);
    }
    process.exit(0);
}

reset();
