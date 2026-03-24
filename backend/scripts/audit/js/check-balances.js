const { Pool } = require('pg');
require('dotenv').config();

async function checkBalances() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        console.log("🔍 Fetching user balances...");
        const res = await pool.query("SELECT id, email, ntkr_balance, wallet_address, role FROM users;");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

checkBalances();
