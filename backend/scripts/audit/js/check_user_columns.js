const pool = require('./src/db/index.js');

async function main() {
    try {
        const res = await pool.query(`
      SELECT 
        column_name, 
        column_default, 
        is_nullable, 
        data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
