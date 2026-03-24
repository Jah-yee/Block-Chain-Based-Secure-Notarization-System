const pool = require('./src/db/index.js');

async function main() {
    try {
        const res = await pool.query(`SELECT id, username, name, email FROM users`);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
