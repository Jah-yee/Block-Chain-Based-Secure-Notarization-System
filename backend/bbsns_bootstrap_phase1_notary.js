const pool = require('./src/db/index');
const { registerNotaryOnChain } = require('./src/blockchain/notary-registry');
const bcrypt = require('bcrypt');

async function run() {
  try {
    console.log('\n--- BBSNS BOOTSTRAP: NOTARY APPROVAL ---\n');

    // 1. Fetch the application created in previous step
    const appRes = await pool.query("SELECT * FROM notary_applications WHERE email = 'notary@bbsns.test'");
    if (appRes.rows.length === 0) {
      console.error('❌ ERROR: Notary application not found. Run bbsns_bootstrap_phase1.js first.');
      return;
    }
    const app = appRes.rows[0];
    console.log(`Found application: ID=${app.id}, Status=${app.status}`);

    if (app.status === 'approved') {
      console.log('ℹ️ Application already approved in DB.');
    } else {
      console.log('Action 1: Approving Application in DB...');
      
      // We need a password for the new user, we'll hash one here.
      const hashedPassword = await bcrypt.hash('NotaryPass123!', 10);

      await pool.query('BEGIN');
      
      // Create user if not exists
      const userRes = await pool.query(`
        INSERT INTO users (
          username, name, email, password_hash, wallet_address, role, kyc_verified, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'notary', true, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET role = 'notary', kyc_verified = true
        RETURNING id, name, role, wallet_address
      `, [app.email, app.full_name, app.email, hashedPassword, app.wallet_address]);
      
      const newUser = userRes.rows[0];
      
      // Update app
      await pool.query("UPDATE notary_applications SET user_id = $1, status = 'approved' WHERE id = $2", [newUser.id, app.id]);
      
      await pool.query('COMMIT');
      console.log('✅ SUCCESS: DB User created/updated:', newUser);
    }

    // 2. On-Chain Registration
    console.log('\nAction 2: Performing On-Chain Registration...');
    try {
      const bcreply = await registerNotaryOnChain(app.wallet_address);
      console.log('✅ SUCCESS: On-chain registration confirmed.', bcreply);
    } catch (bcerr) {
      console.error('❌ BLOCKCHAIN ERROR:', bcerr.message);
    }

    console.log('\n--- NOTARY BOOTSTRAP COMPLETE ---');
  } catch (err) {
    console.error('❌ ERROR:', err);
  } finally {
    await pool.end();
  }
}

run();
