const pool = require('./src/db/index');

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `);
        console.log("Users Table Columns:", res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSchema();
