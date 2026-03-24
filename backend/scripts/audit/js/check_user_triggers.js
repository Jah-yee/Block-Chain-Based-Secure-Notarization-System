const pool = require('./src/db/index.js');

async function main() {
    try {
        const res = await pool.query(`
      SELECT 
        trg.tgname AS trigger_name,
        rel.relname AS table_name,
        CASE trg.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS action_timing,
        CASE trg.tgtype & 4 WHEN 4 THEN 'ROW' ELSE 'STATEMENT' END AS action_orientation,
        trg.tgtype,
        pg_get_triggerdef(trg.oid) AS trigger_definition
      FROM pg_trigger trg
      JOIN pg_class rel ON trg.tgrelid = rel.oid
      WHERE rel.relname = 'users' AND NOT trg.tgisinternal;
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
