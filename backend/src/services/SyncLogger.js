const pool = require('../db');

/**
 * SyncLogger: Authoritative Flight Recorder for Distributed State Machines
 * 
 * Responsibility: Granular, fire-and-forget decision traceability.
 */

const SYNC_EVENTS = {
  // Core Execution
  SYNC_STARTED: "SYNC_STARTED",
  TX_SUBMITTED: "TX_SUBMITTED",
  TX_CONFIRMED: "TX_CONFIRMED",
  TX_FAILED: "TX_FAILED",
  TX_PENDING_WAIT: "TX_PENDING_WAIT",

  // Decision Paths
  SKIP_DUE_TO_HASH: "SKIP_DUE_TO_HASH",
  SELF_HEAL_SUCCESS: "SELF_HEAL_SUCCESS",
  
  // Failure & Recovery
  RETRY_SCHEDULED: "RETRY_SCHEDULED",
  CIRCUIT_BREAKER_TRIGGERED: "CIRCUIT_BREAKER_TRIGGERED",
  PROCESSING_TIMEOUT_RECOVERED: "PROCESSING_TIMEOUT_RECOVERED",
  
  // Administrative
  MANUAL_RETRY_TRIGGERED: "MANUAL_RETRY_TRIGGERED",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE"
};

const SyncLogger = {
  EVENTS: SYNC_EVENTS,

  /**
   * logEvent: Non-blocking, fire-and-forget audit trace
   */
  async logEvent({
    userId,
    syncType, // 'identity' | 'role'
    eventType,
    statusBefore,
    statusAfter,
    txHash = null,
    retryCount = null,
    manualRetryCount = null,
    error = null,
    metadata = {}
  }) {
    // 🛡️ Fire-and-forget safety
    try {
      await pool.query(
        `INSERT INTO user_sync_events (
          user_id, sync_type, event_type, tx_hash, 
          retry_count, manual_retry_count, 
          status_before, status_after, 
          error, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId, syncType, eventType, txHash,
          retryCount, manualRetryCount,
          statusBefore, statusAfter,
          error, JSON.stringify(metadata)
        ]
      );
    } catch (err) {
      console.error(`[SYNC_LOGGER_FAIL] Failed to log event ${eventType} for user ${userId}:`, err.message);
    }
  }
};

module.exports = SyncLogger;
