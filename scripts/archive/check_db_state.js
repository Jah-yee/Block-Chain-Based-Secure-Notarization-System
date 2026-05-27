const { Pool } = require('./backend/node_modules/pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb' });

async function check() {
    try {
        const tables = [
            'notary_applications',
            'documents',
            'governance_votes',
            'governance_proposals',
            'system_config_history',
            'users'
        ];

        console.log('--- DB STATE (Port 5432) ---');
        for (const table of tables) {
            const res = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`${table}: ${res.rows[0].count}`);
        }
        
        const res2 = await pool.query('SELECT email, role FROM users LIMIT 5');
        if (res2.rows.length > 0) {
            console.log('Sample Users:', res2.rows);
        }
    } catch (err) {
        console.error('Check failed:', err.message);
    } finally {
        await pool.end();
    }
}

check();
