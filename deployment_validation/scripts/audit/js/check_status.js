require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb",
});

async function checkStatus() {
    try {
        const res = await pool.query("SELECT id, name, email, role, kyc_verified FROM users WHERE email = 'notary@bbsns.com'");
        console.log("User Status:", res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkStatus();
