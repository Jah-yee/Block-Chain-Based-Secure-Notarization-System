const pool = require('./src/db/index');

async function updateOwner() {
    const hash = '4c1029697ee358715d3a14a2add817c4b01651440de808371f78165ac90dc581';
    const userId = 1;

    try {
        const res = await pool.query('UPDATE users SET national_id_hash = $1 WHERE id = $2', [hash, userId]);
        console.log('Update Successful:', res.rowCount, 'row(s) affected');
    } catch (err) {
        console.error('Update Failed:', err);
    } finally {
        process.exit(0);
    }
}

updateOwner();
