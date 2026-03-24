const pool = require('./src/db/index');

async function checkEnum() {
    try {
        const res = await pool.query("SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'proposal_type')");
        console.log('ALLOWED_TYPES:');
        res.rows.forEach(r => console.log('- ' + r.enumlabel));
        process.exit(0);
    } catch (err) {
        console.error('Error checking enum:', err.message);
        process.exit(1);
    }
}

checkEnum();
