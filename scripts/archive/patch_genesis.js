const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb' });

const update = async () => {
    console.log("🚀 Patching Genesis Activation Address in Production...");
    const res = await pool.query('SELECT config_snapshot FROM system_config WHERE id = 1');
    let config = res.rows[0].config_snapshot;
    
    config.contracts.genesisActivation = '0x34C5799238ed078A4362607de48143690f577bA2';
    
    await pool.query('UPDATE system_config SET config_snapshot = $1, config_version = config_version + 1 WHERE id = 1', [JSON.stringify(config)]);
    console.log('✅ DB Config Updated Successfully');
    process.exit(0);
};

update().catch(err => {
    console.error(err);
    process.exit(1);
});
