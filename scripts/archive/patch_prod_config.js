const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb' });

const update = async () => {
    console.log("🚀 Starting Production Database Patch...");
    const res = await pool.query('SELECT config_snapshot FROM system_config WHERE id = 1');
    if (!res.rows[0]) {
        console.error("❌ Config row not found in system_config");
        process.exit(1);
    }
    
    let config = res.rows[0].config_snapshot;
    
    // New Addresses from deployment
    config.contracts.notaryRegistry = '0x8409D557a2Db24912328dBb8DeEBf81179Ad5034';
    config.contracts.documentRegistry = '0x2F27518963a046fc62026593342b28Ad19a0A0d3';
    config.contracts.ntk = '0x0E91Ef6F4eA458a24C8aF6e5a356d881919E2e64';
    config.contracts.ntkr = '0x80b12e72E20cA43Dc4c9367B5558Cc00A7cbd71a';
    
    await pool.query('UPDATE system_config SET config_snapshot = $1, config_version = config_version + 1 WHERE id = 1', [JSON.stringify(config)]);
    
    console.log('✅ Production Database config updated successfully');
    process.exit(0);
};

update().catch(err => {
    console.error("❌ Patch Failed:", err);
    process.exit(1);
});
