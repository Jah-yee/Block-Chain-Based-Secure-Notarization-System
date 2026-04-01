const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config({ override: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const API_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET;

async function runHammer() {
  console.log("🔨 [STRESS_HAMMER] Launching Concurrency Hammer (100 parallel requests)...");
  
  const wallet = '0x' + crypto.randomBytes(20).toString('hex');
  const email = `hammer_${Date.now()}@example.com`;
  const intentId = crypto.randomUUID();
  const txHash = '0x' + crypto.randomBytes(32).toString('hex');

  try {
    // 1. Setup Test User
    const userRes = await pool.query(
      "INSERT INTO users (email, username, password_hash, wallet_address, role, identity_state) VALUES ($1, $2, 'hammer', $3, 'user', 'ACTIVE') RETURNING id, wallet_address",
      [email, `user_${Date.now()}`, wallet]
    );
    const user = userRes.rows[0];
    const token = jwt.sign({ 
        id: user.id, 
        address: user.wallet_address, 
        role: 'user',
        snapshotChainId: process.env.CHAIN_ID || 97, // Correct context
        snapshotBlock: 1000000,
        issuedAt: Date.now()
    }, JWT_SECRET);

    // 2. Setup Intent (Must be AWAITING_PAYMENT to pass Guard 2)
    await pool.query(
      "INSERT INTO upload_intents (id, user_id, wallet_address, file_hash, filename, storage_key, amount, amount_wei, status, expires_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, 1, '1000000000000000000', 'AWAITING_PAYMENT', NOW() + INTERVAL '1 hour')",
      [intentId, user.id, wallet, 'hammer_hash', 'hammer.txt', 'uploads/hammer.txt']
    );

    console.log(`   ✅ Setup Complete: user=${user.id}, intent=${intentId}`);
    console.log(`   🚀 Hammering /api/documents/confirm...`);

    // 3. Launch 100 requests simultaneously
    const requests = [];
    const stats = { 200: 0, 201: 0, 409: 0, 423: 0, 500: 0, other: 0 };

    for (let i = 0; i < 100; i++) {
        requests.push(
            axios.post(`${API_URL}/api/documents/confirm`, 
                { intent_id: intentId, tx_hash: txHash },
                { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true }
            ).then(res => {
                stats[res.status] = (stats[res.status] || 0) + 1;
                if (res.status === 500) console.error(`      ❌ 500 Error: ${JSON.stringify(res.data)}`);
                return res;
            })
        );
    }

    await Promise.all(requests);

    console.log("\n📊 [STRESS_HAMMER] Results:");
    console.log(`   - 200 (Success/Idempotent): ${stats[200] || 0}`);
    console.log(`   - 201 (Created/Verified):   ${stats[201] || 0}`);
    console.log(`   - 409 (Conflict/Used):      ${stats[409] || 0}`);
    console.log(`   - 423 (Locked/Lease):       ${stats[423] || 0}`);
    console.log(`   - 500 (Fatal Crash):        ${stats[500] || 0}`);

    // 4. Verify Final Consistency (SSoT)
    const docCount = await pool.query("SELECT count(*) FROM documents WHERE payment_tx_hash=$1", [txHash]);
    const intentRes = await pool.query("SELECT status FROM upload_intents WHERE id=$1", [intentId]);

    console.log("\n🧪 [FINAL_CONSISTENCY]");
    console.log(`   - Total Documents created for this TX: ${docCount.rows[0].count}`);
    console.log(`   - Final Intent Status: ${intentRes.rows[0].status}`);

    if (docCount.rows[0].count === '1') {
        console.log("\n🚀 STRESS_HAMMER SUCCESS: High-concurrency race condition blocked at the DB layer.");
    } else {
        console.error(`\n❌ STRESS_HAMMER FAILURE: Found ${docCount.rows[0].count} documents! Schema/Locking is NOT atomic!`);
        process.exit(1);
    }

  } catch (err) {
    console.error("❌ Stress Test Failed Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runHammer();
