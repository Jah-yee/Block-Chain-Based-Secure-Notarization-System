const pool = require('./src/db/index');

async function run() {
  try {
    console.log('\n--- BBSNS BOOTSTRAP FIX: PHASE 1 (RETRY) ---\n');

    // 1. Promote first user to ADMIN
    console.log('Action 1: Promoting First Owner to Admin...');
    const adminRes = await pool.query(`
      UPDATE users 
      SET role = 'admin', kyc_verified = true 
      WHERE email = 'bbsns@owner.com' 
      RETURNING id, name, role
    `);
    
    if (adminRes.rows.length > 0) {
      console.log('✅ SUCCESS: Admin promoted:', adminRes.rows[0]);
    } else {
      console.log('⚠️ WARNING: No user found with email bbsns@owner.com');
    }

    // 2. Add Bootstrap Notary Application (SAFE version)
    console.log('\nAction 2: Creating Bootstrap Notary Application...');
    await pool.query("DELETE FROM notary_applications WHERE email = 'notary@bbsns.test'");
    const appRes = await pool.query(`
      INSERT INTO notary_applications (
        full_name, email, wallet_address, status, experience, national_id_hash
      ) VALUES (
        'Bootstrap Notary', 'notary@bbsns.test', '0x1000000000000000000000000000000000000001', 
        'KYC_VERIFIED', 'System Bootstrap Notary', 'BOOTSTRAP_HASH'
      ) RETURNING id, status
    `);
    console.log('✅ SUCCESS: Notary Application ready for approval:', appRes.rows[0]);

    // 3. Fix remote_auth_sessions schema (Ensure id is UUID)
    console.log('\nAction 3: Verifying remote_auth_sessions schema...');
    const tableCheck = await pool.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'remote_auth_sessions' AND column_name = 'id'
    `);
    if (tableCheck.rows[0]?.data_type === 'integer') {
      console.log('⚠️ WARNING: remote_auth_sessions.id is INTEGER. Changing to UUID type.');
      // Drop existing data if any (bootstrap mode)
      await pool.query('TRUNCATE remote_auth_sessions');
      await pool.query('ALTER TABLE remote_auth_sessions ALTER COLUMN id SET DATA TYPE UUID USING (gen_random_uuid())');
      console.log('✅ SCHEMA UPDATED: id is now UUID');
    } else {
      console.log('✅ SCHEMA OK: id is', tableCheck.rows[0]?.data_type);
    }

    console.log('\n--- PHASE 1 DB FIXES COMPLETE ---');
  } catch (err) {
    console.error('❌ BOOTSTRAP ERROR:', err);
  } finally {
    await pool.end();
  }
}

run();
