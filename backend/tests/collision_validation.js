const { Pool } = require('pg');
const crypto = require('crypto');
const { runScavenger } = require('../src/workers/scavenger-worker');
require('dotenv').config({ override: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runTest() {
  console.log("🧪 Starting Cross-Layer Idempotency (Collision) Validation...");
  
  const intentId = crypto.randomUUID();
  // Use a unique wallet for this test to avoid collision
  const wallet = '0x' + crypto.randomBytes(20).toString('hex');
  
  try {
    // 0. Ensure user
    const user = await pool.query(
      "INSERT INTO users (email, username, password_hash, wallet_address, role) VALUES ($1, $2, $3, $4, 'user') ON CONFLICT (email) DO UPDATE SET wallet_address=$4 RETURNING id", 
      [`collision_${Date.now()}@example.com`, `coll_user_${Date.now()}`, 'dummy_hash', wallet]
    );
    const userId = user.rows[0].id;

    // 1. Create intent in intermediate state (PAYMENT_VERIFIED) with a dummy tx_hash
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    await pool.query(
      "INSERT INTO upload_intents (id, user_id, wallet_address, file_hash, filename, storage_key, amount, amount_wei, status, payment_tx_hash) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAYMENT_VERIFIED', $9)",
      [intentId, userId, wallet, 'collision_hash_' + Date.now(), 'test.txt', 'uploads/test.txt', 1, '1000000000000000000', txHash]
    );
    console.log("   ✅ Intent seeded in intermediate state: PAYMENT_VERIFIED");

    // 2. Simulate API acquisition (Apply lease)
    const lockUntil = new Date(Date.now() + 60000); // 1 minute lease
    const nodeId = crypto.randomUUID();
    await pool.query(
      "UPDATE upload_intents SET processing_lock_until=$1, processing_node_id=$2 WHERE id=$3",
      [lockUntil, nodeId, intentId]
    );
    console.log("   ✅ API Lease active (Simulating busy process)");

    // 3. Run Scavenger and verify it skips the locked intent
    console.log("   🚀 Running Scavenger (Expect skip)...");
    await runScavenger();
    
    const res = await pool.query("SELECT status, processing_node_id FROM upload_intents WHERE id=$1", [intentId]);
    if (res.rows[0].status === 'PAYMENT_VERIFIED' && res.rows[0].processing_node_id === nodeId) {
        console.log("   ✅ SCENARIO 1: Scavenger correctly skipped locked intent.");
    } else {
        throw new Error(`❌ Scavenger failed to skip: Status=${res.rows[0].status}`);
    }

    // 4. Release lease and let Scavenger recover
    await pool.query("UPDATE upload_intents SET processing_lock_until=NOW() - INTERVAL '1 second' WHERE id=$1", [intentId]);
    console.log("   ✅ Lease released.");
    
    console.log("   🚀 Running Scavenger (Expect recovery)...");
    await runScavenger();
    
    const res2 = await pool.query("SELECT status FROM upload_intents WHERE id=$1", [intentId]);
    if (res2.rows[0].status === 'COMPLETED') {
        console.log("   ✅ SCENARIO 2: Scavenger correctly recovered the intent to COMPLETED.");
        
        // 5. Verify document was created
        const docRes = await pool.query("SELECT * FROM documents WHERE payment_tx_hash=$1", [txHash]);
        if (docRes.rows.length > 0) {
            console.log(`   ✅ Document found in DB: ${docRes.rows[0].id}`);
        } else {
            throw new Error("❌ Scavenger failed to create document record.");
        }
    } else {
        throw new Error(`❌ Scavenger failed rescue: Status=${res2.rows[0].status}`);
    }

    console.log("\n🚀 COLLISION VALIDATION SUCCESSFUL: Parallel recovery logic verified.");
  } catch (err) {
    console.error("❌ Collision Validation Failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTest();
