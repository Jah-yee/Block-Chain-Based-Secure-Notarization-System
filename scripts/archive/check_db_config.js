const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb' });

const check = async () => {
    const res = await pool.query('SELECT config_snapshot FROM system_config WHERE id = 1');
    if (res.rows.length === 0) {
        console.log("❌ No config found in DB");
    } else {
        const config = res.rows[0].config_snapshot;
        console.log("🔍 DB CONFIG AUTHORITY:");
        console.log(JSON.stringify(config, null, 2));
    }
    process.exit(0);
};

check().catch(err => {
    console.error(err);
    process.exit(1);
});
