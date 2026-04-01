const { Client } = require('pg');
require('dotenv').config();

async function proveWipe() {
    console.log('🧪 VERIFYING FRESHNESS...');
    
    const config = {
        user: 'bbsns_user',
        host: 'localhost',
        database: 'notarydb',
        password: 'bbsns_pass',
        port: 5433,
    };

    const client = new Client(config);

    try {
        await client.connect();
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(`   - Current tables in notarydb: ${res.rowCount}`);
        res.rows.forEach(r => console.log(`      - ${r.table_name}`));
        
        if (res.rowCount > 0) {
            console.error('❌ [PROVE_FAIL] Database is NOT clean.');
        } else {
            console.log('✅ [PROVE_SUCCESS] Database is 100% clean.');
        }
    } catch (err) {
        console.error('❌ [PROVE_FATAL] Error:', err.message);
    } finally {
        await client.end();
    }
}

proveWipe();
