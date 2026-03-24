const pool = require('../db/index');

/**
 * LockService
 * Provides distributed locking using Postgres Advisory Locks.
 * This ensures that critical background tasks run on only one instance at a time.
 */
class LockService {
    /**
     * Attempts to acquire a non-blocking advisory lock.
     * @param {number} lockId - Unique 64-bit integer ID for the lock.
     * @returns {Promise<boolean>} - True if lock acquired, false if already held.
     */
    async tryLock(lockId) {
        try {
            // pg_try_advisory_lock returns true if successful, false otherwise.
            const res = await pool.query('SELECT pg_try_advisory_lock($1) as locked', [lockId]);
            const success = res.rows[0].locked;
            if (success) {
                console.log(`[LOCK] Acquired lock: ${lockId}`);
            }
            return success;
        } catch (err) {
            console.error(`[LOCK] Error acquiring lock ${lockId}:`, err.message);
            return false;
        }
    }

    /**
     * Releases an advisory lock.
     * @param {number} lockId 
     */
    async unlock(lockId) {
        try {
            await pool.query('SELECT pg_advisory_unlock($1)', [lockId]);
            console.log(`[LOCK] Released lock: ${lockId}`);
        } catch (err) {
            console.error(`[LOCK] Error releasing lock ${lockId}:`, err.message);
        }
    }

    // Stable Lock IDs for Worker Tasks
    static get KEYS() {
        return {
            RECONCILIATION: 1001,
            REPUTATION: 1002,
            IDENTITY_SYNC: 1003,
            INTENT_CLEANUP: 1004
        };
    }
}

module.exports = new LockService();
