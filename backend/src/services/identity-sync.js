const pool = require('../db/index.js');
const { registerNotaryOnChain, attachNotaryRegistry } = require('../blockchain/notary-registry.js');
const { connectBNB } = require('../blockchain/connection.js');
const SyncLogger = require('./SyncLogger.js');

/**
 * executeAuthoritativeRegistration: Hardened 3-Path Identity Sync
 */
async function triggerOnChainRegistration(user) {
  const { contract } = await attachNotaryRegistry();
  const { provider } = await connectBNB();
  const userId = user.id;

  try {
    // --- PATH 1: TX_EXISTS (Recovery Mode) ---
    if (user.tx_hash) {
      console.log(`[IDENTITY_SYNC] 🔍 Tracking existing TX: ${user.tx_hash}`);
      const receipt = await provider.getTransactionReceipt(user.tx_hash);
      
      if (receipt) {
        if (receipt.status === 1) {
          console.log(`[IDENTITY_SYNC] ✅ TX confirmed. Settling.`);
          await pool.query(
            "UPDATE users SET tx_status = 'confirmed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
            [userId]
          );
          await SyncLogger.logEvent({
            userId, syncType: 'identity', eventType: SyncLogger.EVENTS.TX_CONFIRMED,
            statusBefore: 'processing', statusAfter: 'confirmed', txHash: user.tx_hash
          });
        } else {
          console.log(`[IDENTITY_SYNC] ❌ TX reverted.`);
          await SyncLogger.logEvent({
            userId, syncType: 'identity', eventType: SyncLogger.EVENTS.TX_FAILED,
            statusBefore: 'processing', statusAfter: 'failed', txHash: user.tx_hash, error: 'REVERTED'
          });
          await handleIdentitySyncFailure(user, 'TRANSACTION_REVERTED');
        }
      } else {
        console.log(`[IDENTITY_SYNC] ⏳ TX pending. Skipping.`);
        await SyncLogger.logEvent({
          userId, syncType: 'identity', eventType: SyncLogger.EVENTS.TX_PENDING_WAIT,
          statusBefore: 'processing', statusAfter: 'processing', txHash: user.tx_hash
        });
        // Release back to queue by resetting tx_status to 'retrying'
        await pool.query("UPDATE users SET tx_status = 'retrying', status_updated_at = NOW() WHERE id = $1", [userId]);
      }
      return;
    }

    // --- PATH 2: PREFLIGHT_VALIDATE (Self-Heal Mode) ---
    console.log(`[IDENTITY_SYNC] 🔍 Pre-flight on-chain check...`);
    const liveRole = await contract.getUserRole(user.wallet_address);
    if (Number(liveRole) > 0) {
      console.log(`[IDENTITY_SYNC] ✅ Self-settling.`);
      await pool.query(
        "UPDATE users SET tx_status = 'confirmed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
        [userId]
      );
      await SyncLogger.logEvent({
        userId, syncType: 'identity', eventType: SyncLogger.EVENTS.SELF_HEAL_SUCCESS,
        statusBefore: 'processing', statusAfter: 'confirmed', metadata: { reason: 'already_owner_onchain' }
      });
      return;
    }

    // --- PATH 3: SEND_TX (Submission Mode) ---
    console.log(`[IDENTITY_SYNC] 🚀 Submitting registration...`);
    const result = await registerNotaryOnChain(user.wallet_address);
    
    if (result && result.txHash) {
      await pool.query(
        "UPDATE users SET tx_hash = $1, tx_status = 'initiated', updated_at = NOW(), status_updated_at = NOW() WHERE id = $2",
        [result.txHash, userId]
      );
      await SyncLogger.logEvent({
        userId, syncType: 'identity', eventType: SyncLogger.EVENTS.TX_SUBMITTED,
        statusBefore: 'processing', statusAfter: 'initiated', txHash: result.txHash, retryCount: user.retry_count
      });
      console.log(`[IDENTITY_SYNC] 🏁 TX Locked: ${result.txHash}`);
    } else {
      throw new Error("On-chain registration failed to return hash");
    }

  } catch (err) {
    await handleIdentitySyncFailure(user, err.message);
  }
}

async function handleIdentitySyncFailure(user, errorMessage) {
  const nextRetryCount = user.retry_count + 1;
  const isHardFailure = nextRetryCount >= 5;
  const newStatus = isHardFailure ? 'permanent_failed' : 'failed';

  await SyncLogger.logEvent({
    userId: user.id, syncType: 'identity', 
    eventType: isHardFailure ? SyncLogger.EVENTS.CIRCUIT_BREAKER_TRIGGERED : SyncLogger.EVENTS.RETRY_SCHEDULED,
    statusBefore: 'processing', statusAfter: newStatus, error: errorMessage, retryCount: nextRetryCount
  });
  
  await pool.query(
    "UPDATE users SET tx_status = $1, last_error = $2, retry_count = $3, updated_at = NOW(), status_updated_at = NOW() WHERE id = $4",
    [newStatus, errorMessage, nextRetryCount, user.id]
  );
}

module.exports = { triggerOnChainRegistration };
