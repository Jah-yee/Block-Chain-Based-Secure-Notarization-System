
const pool = require('./backend/src/db/index.js');

async function checkUser(email, wallet) {
  try {
    console.log(`Checking for Email: ${email}`);
    const emailRes = await pool.query('SELECT id, email, wallet_address, role, identity_state FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    console.log('Results by Email:', JSON.stringify(emailRes.rows, null, 2));

    console.log(`Checking for Wallet: ${wallet}`);
    const walletRes = await pool.query('SELECT id, email, wallet_address, role, identity_state FROM users WHERE LOWER(wallet_address) = LOWER($1)', [wallet]);
    console.log('Results by Wallet:', JSON.stringify(walletRes.rows, null, 2));

  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await pool.end();
  }
}

checkUser('owner4@bbsns.com', '0xa2E179f85B1efd03e8c12a7751928653977f7ad2');
