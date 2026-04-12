const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb' });

async function run() {
    console.log('🛡️ [RESET] Initiating Atomic Database Purge...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Audit Check
        const res = await client.query('SELECT version, config_snapshot FROM system_config WHERE id = 1');
        
        if (res.rows[0]) {
            console.log(`📊 Found corrupted config (v${res.rows[0].version}). Moving to history...`);
            await client.query(
                'INSERT INTO system_config_history (version, config_snapshot, updated_by, change_reason, change_source) VALUES ($1, $2, $3, $4, $5)',
                [res.rows[0].version, JSON.stringify(res.rows[0].config_snapshot), 'SYSTEM_RECOVERY', 'Hardened 7-Contract Blueprint Reset', 'system_recovery']
            );
            
            // 2. Wipe
            await client.query('DELETE FROM system_config WHERE id = 1');
            console.log('✅ Corrupted Single Source of Truth purged.');
        } else {
            console.log('ℹ️ system_config is already empty. Clean slate verified.');
        }
        
        await client.query('COMMIT');
        
        const countRes = await client.query('SELECT COUNT(*) FROM system_config');
        console.log(`📊 Final SSoT Row Count: ${countRes.rows[0].count}`);
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ [FATAL] Database reset failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
