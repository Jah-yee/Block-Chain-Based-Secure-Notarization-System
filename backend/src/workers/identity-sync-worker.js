'use strict';

require('dotenv').config();
const pool = require('../db/index');
const SyncLogger = require('../services/SyncLogger');
const { runWithSystemContext } = require('../middleware/actor');
const WorkerRegistry = require('../services/worker-registry.service');
const { triggerOnChainRegistration } = require('../services/identity-sync');

const SYNC_INTERVAL_MS = process.env.IDENTITY_SYNC_INTERVAL_MS || 60000;

// Authoritative service imported above

async function startWorker() {
  console.log("[IDENTITY_WORKER] Started. Authoritative Logging & Traceability active.");

  while (true) {
    // 🛡️ [PHASE 6.2] Wrap worker cycle in System Audit Context
    await runWithSystemContext('IDENTITY_SYNC_WORKER', 'Processing pending user activations', async () => {
      try {
        WorkerRegistry.heartbeat('identity_sync', 'OK');

        // 🛡️ ATOMIC CLAIM (Hardened Pattern)
        const claimRes = await pool.query(`
            UPDATE users 
            SET tx_status = 'processing', 
                last_attempt_at = NOW()
            WHERE id = (
                SELECT id FROM users 
                WHERE identity_state = 'ACTIVE'
                  AND tx_status IN ('pending', 'initiated', 'failed', 'retrying')
                  AND (tx_status IS NOT NULL AND tx_status != 'confirmed')
                  AND retry_count < 5
                  AND (status_updated_at IS NULL OR NOW() > status_updated_at + (power(2, retry_count) * interval '1 minute'))
                ORDER BY status_updated_at ASC NULLS FIRST
                FOR UPDATE SKIP LOCKED
                LIMIT 1 
            )
            RETURNING id, wallet_address, retry_count, tx_status as status_before, tx_hash, manual_retry_count
        `);

        if (claimRes.rows.length > 0) {
          const user = claimRes.rows[0];
          console.log(`[IDENTITY_WORKER] 🎯 Claimed: ${user.wallet_address} (Retry: ${user.retry_count})`);
          
          await SyncLogger.logEvent({
            userId: user.id,
            syncType: 'identity',
            eventType: SyncLogger.EVENTS.SYNC_STARTED,
            statusBefore: user.status_before || 'NULL',
            statusAfter: 'processing',
            retryCount: user.retry_count,
            manualRetryCount: user.manual_retry_count
          });
          try {
            await triggerOnChainRegistration(user);
          } catch (err) {
            console.error(`[IDENTITY_WORKER] ❌ Service error for ${user.wallet_address}:`, err.message);
          }
        }

        // 🛡️ TIMEOUT RECOVERY: Reset tasks stuck in 'processing' (> 15 mins) with NO tx_hash
        const timeoutRes = await pool.query(`
            UPDATE users
            SET tx_status = 'failed',
                status_updated_at = NOW()
            WHERE tx_status = 'processing'
              AND tx_hash IS NULL
              AND last_attempt_at < NOW() - INTERVAL '15 minutes'
            RETURNING id, wallet_address
        `);

        for (const st of timeoutRes.rows) {
          await SyncLogger.logEvent({
            userId: st.id, syncType: 'identity', eventType: SyncLogger.EVENTS.PROCESSING_TIMEOUT_RECOVERED,
            statusBefore: 'processing', statusAfter: 'failed', metadata: { reason: 'stale_processing_no_hash' }
          });
        }
      } catch (err) {
        console.error("[IDENTITY_WORKER] 🚨 FATAL LOOP ERROR:", err.message);
        WorkerRegistry.heartbeat('identity_sync', 'FAIL', { error: err.message });
      }
    });

    // Polling interval remains 60s for efficiency
    await new Promise(resolve => setTimeout(resolve, SYNC_INTERVAL_MS));
  }
}

if (require.main === module) {
  pool.init();
  startWorker();
}

module.exports = { startWorker };
