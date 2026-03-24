const pool = require('../db/index.js');
const { registerNotaryOnChain } = require('../blockchain/notary-registry.js');
const { connectBNB } = require("../blockchain/connection.js");

/**
 * Triggers the on-chain registration for a KYC-verified user.
 * Transitions state: FAILED_SYNC -> (INITIATED) -> ACTIVE
 */
async function triggerOnChainRegistration(userId) {
  try {
    const { provider, contract } = await connectBNB();

    // FETCH USER
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      throw new Error(`User with ID ${userId} not found.`);
    }
    const user = result.rows[0];

    console.log(`[IDENTITY_SYNC] Processing ${user.wallet_address}...`);

    // 1. MANDATORY On-Chain Pre-flight (Idempotency Protect)
    const liveRole = await contract.getUserRole(user.wallet_address);
    if (Number(liveRole) > 0) {
      console.log(`[IDENTITY_SYNC] ✅ User ${user.wallet_address} already registered on-chain. Skipping TX.`);
      await pool.query("UPDATE users SET identity_state = 'ACTIVE', tx_status = 'confirmed' WHERE id = $1", [user.id]);
      return;
    }

    // 2. Execute Transaction
    // The task was already marked 'initiated' by the worker/caller via atomic claim.
    const { txHash, success } = await registerNotaryOnChain(user.wallet_address);
    
    if (success && txHash) {
      // 3. Record tx_hash immediately
      await pool.query(
        "UPDATE users SET tx_hash = $1, tx_status = 'pending', updated_at = NOW() WHERE id = $2",
        [txHash, user.id]
      );
      console.log(`[IDENTITY_SYNC] 🚀 TX Sent: ${txHash}. Waiting for reconciliation.`);
    } else {
      throw new Error("On-chain registration failed to return success");
    }

  } catch (err) {
    console.error(`[IDENTITY_SYNC] ❌ Error syncing User ${userId}:`, err.message);
    await pool.query(
      "UPDATE users SET tx_status = 'failed', updated_at = NOW() WHERE id = $1",
      [userId]
    );
    throw err;
  }
}

module.exports = { triggerOnChainRegistration };
