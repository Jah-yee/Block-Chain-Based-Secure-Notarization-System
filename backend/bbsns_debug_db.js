const pool = require('./src/db/index');

async function run() {
  try {
    console.log('Testing DB connection...');
    const now = await pool.query('SELECT NOW()');
    console.log('DB Time:', now.rows[0].now);

    console.log('Fetching users...');
    const users = await pool.query('SELECT * FROM users');
    console.log('Found', users.rows.length, 'users');
    users.rows.forEach(u => {
      console.log(`ID: ${u.id}, Wallet: ${u.wallet_address}, Role: ${u.role}, Email: ${u.email}`);
    });

    console.log('Checking remote_auth_sessions...');
    const sessions = await pool.query('SELECT * FROM remote_auth_sessions LIMIT 1');
    console.log('Sessions check OK');

  } catch (err) {
    console.error('--- ERROR START ---');
    console.error(err);
    console.error('--- ERROR END ---');
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('UNHANDLED ERROR:', err);
  process.exit(1);
});
