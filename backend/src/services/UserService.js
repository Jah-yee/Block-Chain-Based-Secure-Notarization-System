const pool = require('../db');
const logger = require('./logger.service');

/**
 * UserService: Hardened Identity Lifecycle Stewardship
 * Centralizes all user state transitions to ensure auditability and FSM compliance.
 */
class UserService {
  /**
   * updateIdentityState: Atomic, Auditable State Transition
   * @param {number} userId - The target user's ID
   * @param {string} newState - The target identity_state (PENDING, ACTIVE, etc.)
   * @param {number} actorId - The user performing the action (for audit)
   * @param {string} reason - Human-readable reason for the change
   */
  async updateIdentityState(userId, newState, actorId, reason) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the row to prevent race conditions during long FSM checks
      // and ensure we are reading the latest state for the trigger
      const lockResult = await client.query(
        'SELECT identity_state, is_human_verified FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (lockResult.rowCount === 0) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // 2. Supply session metadata for the trigger (MANDATORY)
      // These are local to the transaction and required by fn_identity_lifecycle_steward
      await client.query('SET LOCAL app.user_id = $1', [actorId]);
      await client.query('SET LOCAL app.reason = $2', [reason]);

      // 3. Perform the update
      // The trigger 'trg_enforce_identity_lifecycle' will intercept this,
      // validate against the FSM, check is_human_verified, and log the audit history.
      await client.query(
        'UPDATE users SET identity_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newState, userId]
      );

      await client.query('COMMIT');
      logger.info(`Identity state updated for user ${userId} to ${newState} by actor ${actorId}`);
      
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Failed to update identity state for user ${userId}: ${err.message}`);
      
      // Propagate the trigger's RAISE EXCEPTION message to the caller
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper to fetch current user state
   */
  async getUserIdentity(userId) {
    try {
      const result = await pool.query(
        'SELECT id, username, email, identity_state, is_human_verified, role FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0];
    } catch (err) {
      logger.error(`Error fetching user identity: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new UserService();
