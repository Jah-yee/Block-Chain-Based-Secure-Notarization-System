const { Client } = require('pg');
async function test() {
  const client = new Client({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb_test' });
  await client.connect();
  try {
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables Found:', res.rows.map(r => r.table_name).sort());
    
    if (res.rows.find(r => r.table_name === 'system_configs')) {
        const config = await client.query('SELECT * FROM system_configs ORDER BY version DESC LIMIT 1');
        console.log('Latest Config:', JSON.stringify(config.rows[0], null, 2));
    } else {
        console.log('--- ERROR: system_configs TABLE MISSING ---');
    }
  } catch (e) {
    console.error('Check failed:', e.message);
  } finally {
    await client.end();
  }
}
test();
