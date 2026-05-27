require('dotenv').config();
const pool = require('../db/index.js');
const { attachNotaryRegistry } = require('../blockchain/notary-registry.js');
const ntkService = require('../services/ntk.service.js');
const SyncLogger = require('../services/SyncLogger.js');
const SYNC_INTERVAL_MS = 60000; // Check every 60 seconds

/**
 * Role Sync Worker
 * 
 * Responsibility: Privileged Role Escalation (Owner -> Notary)
 * This worker ensures that users approved as Notaries are promoted on-chain.
 */
async function startWorker() {
  console.log("[ROLE_WORKER] Started. Hardened Privilege Synchronization active.");

  while (true) {
    // 🛡️ [SYSTEM_AUDIT] authoritative worker context
    await require('../middleware/actor').runWithSystemContext('ROLE_SYNC_WORKER', 'Promoting users to on-chain Notary roles', async () => {
    try {
    // 🛡️ ATOMIC CLAIM (Hardened Pattern)
    // 1. FOR UPDATE SKIP LOCKED ensures zero-duplication
    // 2. Exponential Backoff logic + Circuit Breaker support
    const claimRes = await pool.query(`
        UPDATE users 
        SET role_tx_status = 'processing', 
            role_last_attempt_at = NOW()
        WHERE id = (
            SELECT id FROM users 
            WHERE role = 'notary'
              AND role_tx_status IN ('initiated', 'failed', 'retrying', 'pending_finalize')
              AND role_retry_count < 5
              AND (role_status_updated_at IS NULL OR NOW() > role_status_updated_at + (power(2, role_retry_count) * interval '1 minute'))
            ORDER BY role_status_updated_at ASC NULLS FIRST
            FOR UPDATE SKIP LOCKED
            LIMIT 1 
        )
        RETURNING id, wallet_address, role_retry_count, role_tx_hash, role_tx_status as status_before, role_manual_retry_count
    `);

    if (claimRes.rows.length > 0) {
      const user = claimRes.rows[0];
      console.log(`[ROLE_WORKER] 🎯 Claimed: ${user.wallet_address} (Retry: ${user.role_retry_count}, Hash: ${user.role_tx_hash || 'NONE'})`);
      
      await SyncLogger.logEvent({
        userId: user.id,
        syncType: 'role',
        eventType: SyncLogger.EVENTS.SYNC_STARTED,
        statusBefore: user.status_before,
        statusAfter: 'processing',
        retryCount: user.role_retry_count,
        manualRetryCount: user.role_manual_retry_count
      });
      try {
        await executeAuthoritativePromotion(user);
      } catch (err) {
        console.error(`[ROLE_WORKER] ❌ Execution error for ${user.wallet_address}:`, err.message);
      }
    }

    // 🛡️ TIMEOUT RECOVERY: Reset tasks stuck in 'processing' (> 15 mins) with NO tx_hash
    const timeoutRes = await pool.query(`
        UPDATE users
        SET role_tx_status = 'failed',
            role_status_updated_at = NOW()
        WHERE role_tx_status = 'processing'
          AND role_tx_hash IS NULL
          AND role_last_attempt_at < NOW() - INTERVAL '15 minutes'
        RETURNING id, wallet_address
    `);

    for (const st of timeoutRes.rows) {
      await SyncLogger.logEvent({
        userId: st.id, syncType: 'role', eventType: SyncLogger.EVENTS.PROCESSING_TIMEOUT_RECOVERED,
        statusBefore: 'processing', statusAfter: 'failed', metadata: { reason: 'stale_processing_no_hash' }
      });
    }

    } catch (err) {
      console.error("[ROLE_WORKER] 🚨 FATAL LOOP ERROR:", err.message);
    }
    });

    await new Promise(resolve => setTimeout(resolve, SYNC_INTERVAL_MS));
  }
}

async function executeAuthoritativePromotion(user) {
  const { contract, provider } = await attachNotaryRegistry();

  try {
    // --- PATH 1: TX_EXISTS (Recovery Mode) ---
    // If we have a hash, we are NOT allowed to send a new TX.
    if (user.role_tx_hash) {
      console.log(`[ROLE_SYNC] 🔍 Tracking existing TX: ${user.role_tx_hash}`);
      const receipt = await provider.getTransactionReceipt(user.role_tx_hash);
      
      if (receipt) {
        if (receipt.status === 1) {
          console.log(`[ROLE_SYNC] ✅ TX confirmed on-chain. Settling.`);
          await pool.query(
            "UPDATE users SET role_tx_status = 'confirmed', updated_at = NOW(), role_status_updated_at = NOW() WHERE id = $1",
            [user.id]
          );
          // 🚀 [NTK_TRIGGER] Check for instant provisioning
          await ntkService.verifyAndProvisionInitialNTK(user.id);
          await SyncLogger.logEvent({
            userId: user.id, syncType: 'role', eventType: SyncLogger.EVENTS.TX_CONFIRMED,
            statusBefore: 'processing', statusAfter: 'confirmed', txHash: user.role_tx_hash
          });
        } else {
          console.log(`[ROLE_SYNC] ❌ TX reverted. Transitioning to failed for retry.`);
          await SyncLogger.logEvent({
            userId: user.id, syncType: 'role', eventType: SyncLogger.EVENTS.TX_FAILED,
            statusBefore: 'processing', statusAfter: 'failed', txHash: user.role_tx_hash, error: 'REVERTED'
          });
          await handleFailure(user, 'TRANSACTION_REVERTED');
        }
      } else {
        console.log(`[ROLE_SYNC] ⏳ TX still pending. Skipping to prevent duplication.`);
        await SyncLogger.logEvent({
          userId: user.id, syncType: 'role', eventType: SyncLogger.EVENTS.TX_PENDING_WAIT,
          statusBefore: 'processing', statusAfter: 'processing', txHash: user.role_tx_hash
        });
        // Release back to queue by resetting role_tx_status to 'retrying' so another worker can check it later
        await pool.query("UPDATE users SET role_tx_status = 'retrying', role_status_updated_at = NOW() WHERE id = $1", [user.id]);
      }
      return;
    }

    // --- PATH 2: PREFLIGHT_VALIDATE (Self-Heal Mode) ---
    // Check on-chain state to avoid redundant gas burn.
    console.log(`[ROLE_SYNC] 🔍 Pre-flight on-chain check for ${user.wallet_address}...`);
    const liveRole = await contract.getUserRole(user.wallet_address);
    if (Number(liveRole) >= 2) {
      console.log(`[ROLE_SYNC] ✅ On-chain state already correct. Self-settling.`);
      await pool.query(
        "UPDATE users SET role_tx_status = 'confirmed', updated_at = NOW(), role_status_updated_at = NOW() WHERE id = $1",
        [user.id]
      );
      // 🚀 [NTK_TRIGGER] Check for instant provisioning
      await ntkService.verifyAndProvisionInitialNTK(user.id);
      await SyncLogger.logEvent({
        userId: user.id, syncType: 'role', eventType: SyncLogger.EVENTS.SELF_HEAL_SUCCESS,
        statusBefore: 'processing', statusAfter: 'confirmed', metadata: { reason: 'already_notary_onchain' }
      });
      return;
    }

    // --- PATH 3: PENDING_MANUAL_FINALIZE ---
    if (user.status_before !== 'pending_finalize') {
      console.log(`[ROLE_SYNC] ⏳ On-chain promotion pending manual finalization by Admin wallet for ${user.wallet_address}.`);
      await pool.query(
        "UPDATE users SET role_tx_status = 'pending_finalize', role_status_updated_at = NOW() WHERE id = $1",
        [user.id]
      );
      await SyncLogger.logEvent({
        userId: user.id,
        syncType: 'role',
        eventType: 'PENDING_MANUAL_FINALIZE',
        statusBefore: 'processing',
        statusAfter: 'pending_finalize',
        metadata: { reason: 'waiting_for_admin_signature' }
      });
    } else {
      console.log(`[ROLE_SYNC] ⏳ Still waiting for manual Admin finalization for ${user.wallet_address}.`);
      // Update status timestamp to prevent starving but keep checking
      await pool.query(
        "UPDATE users SET role_status_updated_at = NOW() WHERE id = $1",
        [user.id]
      );
    }



  } catch (err) {
    await handleFailure(user, err.message);
  }
}

async function handleFailure(user, errorMessage) {
  const nextRetryCount = user.role_retry_count + 1;
  const isHardFailure = nextRetryCount >= 5;
  const newStatus = isHardFailure ? 'permanent_failed' : 'failed';

  await SyncLogger.logEvent({
    userId: user.id, syncType: 'role', 
    eventType: isHardFailure ? SyncLogger.EVENTS.CIRCUIT_BREAKER_TRIGGERED : SyncLogger.EVENTS.RETRY_SCHEDULED,
    statusBefore: 'processing', statusAfter: newStatus, error: errorMessage, retryCount: nextRetryCount
  });
  
  await pool.query(
    `UPDATE users 
     SET role_tx_status = $1, 
         role_last_error = $2, 
         role_retry_count = $3, 
         updated_at = NOW(), 
         role_status_updated_at = NOW() 
     WHERE id = $4`,
    [newStatus, errorMessage, nextRetryCount, user.id]
  );
}

if (require.main === module) {
  pool.init();
  startWorker();
}

module.exports = { startWorker };
