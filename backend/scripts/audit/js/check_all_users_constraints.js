const pool = require('./src/db/index.js');

async function main() {
    try {
        const res = await pool.query(`
      SELECT 
        conname AS constraint_name, 
        contype AS constraint_type,
        pg_get_constraintdef(c.oid) AS constraint_def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'users';
    `);
        console.log(JSON.stringify(res.rows, null, 2));

        const indices = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'users';
    `);
        console.log("Indices:");
        console.log(JSON.stringify(indices.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
