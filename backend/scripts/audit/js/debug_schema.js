const pool = require('./src/db/index');
async function run() {
    try {
        const tables = ['remote_auth_sessions', 'governance_proposals', 'users'];
        for (const tableName of tables) {
            const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`);
            console.log(`${tableName}: ${cols.rows.map(c => `${c.column_name}(${c.data_type})`).join(', ')}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
