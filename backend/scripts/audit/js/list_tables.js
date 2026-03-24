const pool = require('./src/db/index');
async function run() {
    try {
        const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        result.rows.forEach(row => {
            console.log("TABLE_NAME:" + row.table_name);
        });
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
