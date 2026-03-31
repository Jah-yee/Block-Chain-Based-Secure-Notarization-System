const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

async function getUsers() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const res = await pool.query("SELECT id, email, wallet_address, role FROM users;");
        fs.writeFileSync('users_data.json', JSON.stringify(res.rows, null, 2));
        console.log("Data written to users_data.json");
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

getUsers();
