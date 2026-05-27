const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb' });

const update = async () => {
    console.log("🚀 Patching TOTAL SYSTEM CONFIG (v2-FIXED) in Production...");
    const res = await pool.query('SELECT config_snapshot FROM system_config WHERE id = 1');
    let config = res.rows[0].config_snapshot;
    
    config.contracts.genesisNft = '0x1Bc76774b4Af936b5e3422D01f72B4b526474588';
    config.contracts.notaryRegistry = '0x0DD325C87CDF2B00ef6cE9de537AFD4826c98f3c';
    config.contracts.ntk = '0x981cE4Ef97B3A45f7ae02da8d2C228F9ae5B95aF';
    config.contracts.ntkr = '0x02183134884276149d942FE573a3BAAd9E2F632b';
    config.contracts.documentRegistry = '0x45F31eC24b8892D09bd85b655dBf609a984Fa03C';
    config.contracts.genesisActivation = '0x8cD99b69E0192C2803eC178E859d671F015A83b3';
    
    await pool.query('UPDATE system_config SET config_snapshot = $1, config_version = config_version + 1 WHERE id = 1', [JSON.stringify(config)]);
    console.log('✅ DB Config Updated Successfully');
    process.exit(0);
};

update().catch(err => {
    console.error(err);
    process.exit(1);
});
