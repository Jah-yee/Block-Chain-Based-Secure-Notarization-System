const pool = require('../src/db/index');

async function testSelfHealing() {
    console.log('🚮 [TEST] Deleting system_config table contents...');
    await pool.query('DELETE FROM system_config');
    console.log('✅ [TEST] Table cleared.');
    process.exit(0);
}

testSelfHealing();
