const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });

async function run() {
  try {
    console.log('Attempting test INSERT...');
    await pool.query(
      `INSERT INTO users (name, email, wallet_address, role, kyc_verified, national_id_hash, password_hash, username, phone, address) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      ['Test', 'test@test.com', '0x123', 'admin', true, 'hash', 'pass', 'testuser', '123', 'addr']
    );
    console.log('INSERT SUCCESSFUL (Test)');
  } catch (err) {
    console.error('--- DATABASE ERROR ---');
    console.error(err.message);
    console.error('Code:', err.code);
    console.error('Detail:', err.detail);
    console.error('--- ERROR END ---');
  } finally {
    await pool.end();
  }
}

run();
