const pool = require('./src/db/index.js');

async function main() {
    try {
        const res = await pool.query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'wallet_nonces'
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
