const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function updateBalance(email, amount) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        await pool.query('UPDATE users SET ntkr_balance = $1 WHERE email = $2', [amount, email]);
        console.log(`✅ DB Updated: ${email} now has ${amount} NTKR.`);
    } catch (err) {
        console.error("❌ DB Update Failed:", err.message);
    } finally {
        await pool.end();
    }
}

updateBalance('owner@bbsns.com', 15);
