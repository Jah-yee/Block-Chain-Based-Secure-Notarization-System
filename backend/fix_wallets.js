const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function f() {
    const relayer = '0x02252Db03aF7CD8C8d3eC6CFd3AE5f6dab69ACd0'.toLowerCase();
    console.log(`Setting id 1 and 4 to ${relayer}`);
    const r1 = await pool.query('UPDATE users SET wallet_address = $1 WHERE id = 1', [relayer]);
    const r4 = await pool.query('UPDATE users SET wallet_address = $1 WHERE id = 4', [relayer]);
    console.log(`Updated 1: ${r1.rowCount}, Updated 4: ${r4.rowCount}`);
    process.exit(0);
}
f().catch(e => { console.error(e); process.exit(1); });
