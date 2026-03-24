const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

async function corrupt() {
  console.log('🛡️ [GUARDIAN] Initiating Surgical Corruption for Fail-Closed Test...');
  try {
    // 1. Get current config
    const res = await pool.query('SELECT config_snapshot FROM system_config WHERE id = 1');
    const config = res.rows[0].config_snapshot;

    // 2. Corrupt specifically the notaryRegistry (Validation failure target)
    config.contracts.notaryRegistry = '0xINVALID_ADDRESS_FORMAT';

    // 3. Update with version increment
    await pool.query('UPDATE system_config SET config_snapshot = $1, version = version + 1 WHERE id = 1', [JSON.stringify(config)]);

    console.log('✅ [GUARDIAN] DB Corrupted. notaryRegistry is now invalid.');
  } catch (err) {
    console.error('❌ [GUARDIAN] Corruption Failed:', err.message);
  } finally {
    await pool.end();
  }
}

corrupt();
