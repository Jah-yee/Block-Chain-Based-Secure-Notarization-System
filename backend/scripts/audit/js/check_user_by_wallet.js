const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkUser() {
    const wallet = '0x91ed53552ca83709a06d5763315e09f5fc6cdd30'.toLowerCase();
    console.log(`Checking user with wallet: ${wallet}`);

    try {
        const res = await pool.query('SELECT * FROM users WHERE LOWER(wallet_address) = $1', [wallet]);
        if (res.rows.length > 0) {
            console.log('User found:');
            console.log(JSON.stringify(res.rows[0], null, 2));
        } else {
            console.log('User not found in database.');
        }
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await pool.end();
    }
}

checkUser();
