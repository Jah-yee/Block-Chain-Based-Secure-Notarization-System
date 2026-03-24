const pool = require('./src/db/index');
(async () => {
    const r = await pool.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'users'::regclass");
    r.rows.forEach(row => console.log(row.conname, ':', row.pg_get_constraintdef));
    process.exit(0);
})();
