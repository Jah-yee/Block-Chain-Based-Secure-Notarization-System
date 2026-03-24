const pool = require('../db/index.js');
const { triggerOnChainRegistration } = require('../services/identity-sync.js');
const lockService = require('../services/lock.service');

const SYNC_INTERVAL_MS = 60000; // Check every 60 seconds

/**
 * Identity Sync Worker
 */
async function startWorker() {
  console.log("[IDENTITY_WORKER] Started. Integrity Enforcement active.");

  while (true) {
    const lockId = 1003; // IDENTITY_SYNC (Still used for worker-level coordination)
    if (await lockService.tryLock(lockId)) {
      try {
        // ATOMIC CLAIM + LOCK + INTENT (Single DB Operation)
        const claimRes = await pool.query(`
          UPDATE users 
          SET idempotency_key = wallet_address, 
              tx_status = 'initiated', 
              processing_started_at = NOW()
          WHERE id = (
              SELECT id FROM users 
              WHERE (identity_state = 'FAILED_SYNC' OR identity_state = 'KYC_VERIFIED')
                AND (tx_status IS NULL OR tx_status = 'failed')
              ORDER BY created_at ASC 
              LIMIT 1 
              FOR UPDATE SKIP LOCKED
          )
          RETURNING id, wallet_address
        `);

        if (claimRes.rows.length > 0) {
          const user = claimRes.rows[0];
          console.log(`[IDENTITY_WORKER] Claimed Task: User ${user.wallet_address}`);
          try {
            await triggerOnChainRegistration(user);
            console.log(`[IDENTITY_WORKER] ✅ Task complete for ${user.wallet_address}`);
          } catch (err) {
            console.warn(`[IDENTITY_WORKER] ⚠️ Processing failed for ${user.wallet_address}: ${err.message}`);
          }
        }
      } catch (err) {
        console.error("[IDENTITY_WORKER] FATAL LOOP ERROR:", err.message);
      } finally {
        await lockService.unlock(lockId);
      }
    }
 else {
      // console.log("[IDENTITY_WORKER] Skip: Another instance is syncing.");
    }
    
    await new Promise(resolve => setTimeout(resolve, SYNC_INTERVAL_MS));
  }
}

if (require.main === module) {
  startWorker();
}

module.exports = { startWorker };
