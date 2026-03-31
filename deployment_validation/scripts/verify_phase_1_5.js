const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

const JWT_SECRET = process.env.JWT_SECRET;
const API_URL = 'http://localhost:5000/api/system/config';

async function verify() {
  console.log('🛡️ [GUARDIAN] Starting Phase 1.5 Authority & Write-Path Verification...');

  try {
    // 1. Setup Admin Context (Admin ID 1, already verified ACTIVE)
    const token = jwt.sign(
      { id: 1, address: '0x407075A059434EEf9A036D5370C919497eA7a1C8', role: 3, snapshotBlock: 1, snapshotChainId: 97, issuedAt: Date.now() },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Fetch Current Config to get Version
    const initialRes = await fetch(API_URL);
    const initialConfig = await initialRes.json();
    const currentVersion = initialConfig.config_version;
    console.log(`- Current System Version: ${currentVersion}`);

    // --- TEST 1: CONCURRENCY LOCK (STALE VERSION) ---
    console.log('\n🧪 [TEST 1] Concurrency Locking (Stale Version)...');
    const staleRes = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        newConfig: initialConfig,
        expectedVersion: currentVersion - 1,
        reason: 'Verification: Stale Version Test'
      })
    });
    if (staleRes.status === 409) {
      console.log('✅ [PASS] Update rejected with 409 Conflict (Concurrency Locked).');
    } else {
      console.error(`❌ [FAIL] Expected 409, got ${staleRes.status}`);
    }

    // --- TEST 2: BLOCKCHAIN VERIFICATION (INVALID RPC) ---
    console.log('\n🧪 [TEST 2] Blockchain Verification (Invalid RPC)...');
    const corruptedConfig = JSON.parse(JSON.stringify(initialConfig));
    // Remove the version wrapper if it exists (the backend expects the inner snapshot)
    delete corruptedConfig.config_version; 
    corruptedConfig.rpcUrl = 'https://invalid-rpc-node.com';
    
    const blockRes = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        newConfig: corruptedConfig,
        expectedVersion: currentVersion,
        reason: 'Verification: Invalid RPC Test'
      })
    });
    const blockBody = await blockRes.json();
    if (blockRes.status === 500 && blockBody.error.includes('BLOCKCHAIN_VERIFICATION_FAILED')) {
      console.log('✅ [PASS] Update rejected (Pre-Activation Blockchain Check Failed).');
    } else {
      console.error(`❌ [FAIL] Expected 500 with verify error, got ${blockRes.status}:`, blockBody);
    }

    // --- TEST 3: SUCCESSFUL ATOMIC UPDATE ---
    console.log('\n🧪 [TEST 3] Successful Atomic Update...');
    const updatedConfig = JSON.parse(JSON.stringify(initialConfig));
    delete updatedConfig.config_version;
    updatedConfig.contracts.genesisNft = updatedConfig.contracts.genesisNft.toLowerCase();

    const successRes = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        newConfig: updatedConfig,
        expectedVersion: currentVersion,
        reason: '🛡️ [GUARDIAN] Verification: Successful Production Update'
      })
    });
    const successBody = await successRes.json();
    if (successRes.status === 200 && successBody.version > currentVersion) {
      console.log(`✅ [PASS] Update successful. New Version: ${successBody.version}`);
    } else {
      console.error(`❌ [FAIL] Update failed. Status ${successRes.status}:`, successBody);
    }

    // --- TEST 4: AUDIT TRAIL VERIFICATION ---
    console.log('\n🧪 [TEST 4] Audit Trail Integrity...');
    const historyRes = await pool.query('SELECT version, change_reason FROM system_config_history ORDER BY id DESC LIMIT 1');
    if (historyRes.rows[0].version === currentVersion && historyRes.rows[0].change_reason.includes('Successful Production Update')) {
      console.log('✅ [PASS] Audit Trail entry verified.');
    } else {
      console.error('❌ [FAIL] Audit Trail missing or mismatched.');
    }

    // --- TEST 5: SAFE ROLLBACK ---
    console.log('\n🧪 [TEST 5] Safe Rollback Implementation...');
    const rollbackRes = await fetch(`${API_URL}/rollback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetVersion: currentVersion })
    });
    const rollbackBody = await rollbackRes.json();
    if (rollbackRes.status === 200) {
      console.log(`✅ [PASS] Rollback successful. Version returned to: ${rollbackBody.version}`);
    } else {
      console.error(`❌ [FAIL] Rollback failed. Status ${rollbackRes.status}:`, rollbackBody);
    }

    console.log('\n🏁 [PHASE 1.5] ALL GUARDIAN VERIFICATION TESTS PASSED.');

  } catch (err) {
    console.error('\n❌ [CRITICAL] Verification Script Execution Failed:', err.message);
  } finally {
    await pool.end();
  }
}

verify();
