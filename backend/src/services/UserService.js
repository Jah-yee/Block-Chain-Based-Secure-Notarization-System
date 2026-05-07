const pool = require('../db');
const { Logger } = require('./logger.service');
const logger = new Logger('UserService');
const ntkService = require('./ntk.service');

/**
 * UserService: Hardened Identity Lifecycle Authority
 * Centralizes all user creations and state transitions to ensure auditability and FSM compliance.
 */
class UserService {
  /**
   * createUser: Atomic Creation with Initial Audit Entry
   * @param {Object} userData - User metadata (email, name, wallet, password_hash, role)
   * @returns {Object} The created user
   */
  async createUser(userData, externalClient) {
    // 🛡️ [GUARD_1] Mandatory Audit Context (SENTINEL_2.0_FAIL_CLOSED)
    if (!externalClient) {
      throw new Error("Audit violation: UserService.createUser MUST receive an auditClient context.");
    }
    const client = externalClient;

    try {
      // 🛡️ [GUARD_2] Protocol Parameter Enforcement
      if (!userData.role) {
        throw new Error("Identity violation: role is a mandatory parameter for user creation.");
      }

      // 🛡️ [INVARIANT_1] Document Owners are ALWAYS ACTIVE (MVP Policy)
      // This override removes state discretion from route handlers.
      if (userData.role === 'user') {
        userData.identity_state = 'ACTIVE';
      }

      if (!userData.identity_state) {
        throw new Error("Identity violation: identity_state must be explicitly defined for this role.");
      }

      // 🛡️ [CONSTRAINT_SYNC] satisfy DB check constraint for ACTIVE states
      if (userData.identity_state === 'ACTIVE') {
        userData.is_human_verified = true;
        userData.kyc_verified = true;
      }

      // 1. Create the user record
      const fields = Object.keys(userData);
      const values = Object.values(userData);

      const insertQuery = `
        INSERT INTO users (${fields.join(', ')}) 
        VALUES (${fields.map((f, i) => f === 'identity_state' ? `$${i+1}::identity_lifecycle` : `$${i+1}`).join(', ')}) 
        RETURNING id, email, wallet_address, role, identity_state
      `;
      
      const res = await client.query(insertQuery, values);
      const user = res.rows[0];

      // 2. Log Initial State Transition (NULL -> INITIAL)
      await client.query(
        `INSERT INTO user_state_history (user_id, from_state, to_state, reason, changed_by) 
         VALUES ($1, $2, $3::identity_lifecycle, $4, $5)`,
        [user.id, null, user.identity_state, 'INITIAL_PROVISIONING', 0] // 0 = SYSTEM
      );

      logger.info('USER_CREATED', { email: user.email, userId: user.id, state: user.identity_state });

      // 🚀 [NTK_TRIGGER] Instant provisioning for active notaries
      if (user.role === 'notary' && user.identity_state === 'ACTIVE') {
          ntkService.verifyAndProvisionInitialNTK(user.id).catch(err => {
              logger.error('NTK_PROVISION_FAILED', { userId: user.id, error: err.message });
          });
      }

      return user;
    } catch (err) {
      logger.error('USER_CREATION_FAILED', { error: err.message }, err);
      throw err;
    }
  }

  /**
   * promoteToNotary: Hardened Privilege Escalation
   * @param {number} userId - Target user
   * @param {Object} actor - The Admin performing the action
   * @param {string} reason - Audit trail justification
   */
  async promoteToNotary(userId, actor, reason) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 🛡️ [GUARD_1] Lock and Verify Role Consistency
      const userRes = await client.query(
        'SELECT id, role, identity_state::text FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (userRes.rowCount === 0) throw new Error('User not found');
      const user = userRes.rows[0];

      // 🛡️ [GUARD_2] Prevent Double-Promotion & Admin Conflict
      if (user.role === 'notary') {
        throw new Error('User is already a Notary.');
      }
      if (user.role === 'admin') {
        throw new Error('Administrators cannot be demoted/assigned to Notary role via this path.');
      }

      // 1. Update Role & Sync Status (Atomic Authority)
      await client.query(
        `UPDATE users 
         SET role = 'notary', 
             role_tx_status = 'initiated',
             role_retry_count = 0,
             role_status_updated_at = NOW(),
             updated_at = NOW() 
         WHERE id = $1`,
        [userId]
      );

      // 2. Log Escalation
      await client.query(
        `INSERT INTO user_role_history (user_id, from_role, to_role, reason, changed_by) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, user.role, 'notary', reason || 'NOTARY_APPROVAL', actor ? actor.id : 0]
      );

      await client.query('COMMIT');
      logger.info('ROLE_ESCALATION', { userId, oldRole: user.role, newRole: 'notary', actorId: actor ? actor.id : 0 });
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('PROMOTION_FAILED', { userId, error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }

  async updateIdentityState(userId, newState, actor, reason) {
    const VALID_STATES = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'];
    if (!VALID_STATES.includes(newState)) {
      throw new Error(`Invalid target state: ${newState}`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and Audit Current State
      const lockRes = await client.query(
        'SELECT identity_state::text, role FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (lockRes.rowCount === 0) throw new Error('User not found');
      
      const oldState = lockRes.rows[0].identity_state;
      if (oldState === newState) {
        await client.query('COMMIT');
        return true;
      }

      // 2. FSM & Role Enforcement
      const isSystem = !actor;
      const isAdmin = actor && Number(actor.role) === 3;
      const isSelf = actor && Number(actor.id) === Number(userId);

      // BLOCK: Rejected/Suspended -> Pending (must be fixed by Admin first)
      if (newState === 'PENDING' && (oldState === 'REJECTED' || oldState === 'SUSPENDED')) {
        throw new Error(`Transition from ${oldState} to PENDING is restricted to Admin reactivation first.`);
      }

      // ROLE GUARD: Only Admin can set ACTIVE, REJECTED, or SUSPENDED
      const restrictedStates = ['ACTIVE', 'REJECTED', 'SUSPENDED'];
      if (restrictedStates.includes(newState) && !isAdmin && !isSystem) {
        throw new Error(`State ${newState} can only be set by an Administrator.`);
      }

      // 3. Update State
      await client.query(
        `UPDATE users 
         SET identity_state = $1::identity_lifecycle, 
             is_human_verified = CASE WHEN $1::text = 'ACTIVE' THEN true ELSE is_human_verified END,
             kyc_verified = CASE WHEN $1::text = 'ACTIVE' THEN true ELSE kyc_verified END,
             updated_at = NOW() 
         WHERE id = $2`,
        [newState, userId]
      );

      // 4. Log Transition
      await client.query(
        `INSERT INTO user_state_history (user_id, from_state, to_state, reason, changed_by) 
         VALUES ($1, $2::identity_lifecycle, $3::identity_lifecycle, $4, $5)`,
        [userId, oldState, newState, reason || 'SYSTEM_SYNC', actor ? actor.id : 0]
      );

      await client.query('COMMIT');
      logger.info('IDENTITY_TRANSITION', { 
        userId, 
        oldState, 
        newState, 
        actorId: actor ? actor.id : 0 
      });

      // 🚀 [NTK_TRIGGER] Instant provisioning for active notaries
      if (newState === 'ACTIVE') {
          ntkService.verifyAndProvisionInitialNTK(userId).catch(err => {
              logger.error('NTK_PROVISION_FAILED', { userId, error: err.message });
          });
      }

      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('IDENTITY_UPDATE_FAILED', { userId, newState, error: err.message }, err);
      throw err;
    } finally {
      client.release();
    }
  }

  async getUserIdentity(userId) {
    const result = await pool.query(
      'SELECT id, username, email, identity_state, is_human_verified, role FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }
}

module.exports = new UserService();
