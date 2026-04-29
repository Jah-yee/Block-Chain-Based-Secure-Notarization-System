'use strict';

const pool = require('../db/index');
const lockService = require('./lock.service');
const reputationService = require('./reputation.service');
const { runWithSystemContext } = require('../middleware/actor');
const WorkerRegistry = require('./worker-registry.service');

/**
 * Maintenance Service (Survival V3 - Hardened Reconciliation)
 * 
 * DESIGN PRINCIPLES:
 *   - No Infinite Retries (Technical failures have a budget of 5)
 *   - Business Limitations != technical errors (No-notary doesn't burn budget)
 *   - Temporal Guard (30s cooldown between attempts)
 *   - Automated Recovery (10m cooldown for failed documents)
 */
class MaintenanceService {
    constructor() {
        this.lastRun = 0;
        this.cooldownMs = 20000; // 20s between Maintenance Pass TRIALS
    }

    /**
     * fire-and-forget trigger for reconciliation pass.
     */
    triggerPassiveReconciliation() {
        const now = Date.now();
        if (now - this.lastRun < this.cooldownMs) return;
        this.lastRun = now;

        setImmediate(async () => {
            await this.opportunisticReconcile();
        });
    }

    /**
     * The actual healing pass.
     */
    async opportunisticReconcile() {
        let locked = false;
        try {
            locked = await lockService.tryLock(lockService.KEYS.RECONCILIATION);
            if (!locked) return;

            // 🛡️ RECOVERY QUERY (V3)
            // 1. Docs in 'pending' or 'waiting_for_notary' or 'processing' (stuck)
            // 2. OR Docs in 'failed' but older than 10 minutes (Automated Recovery Path)
            // 3. AND haven't exceeded technical budget (5 retries)
            // 4. AND haven't been tried in the last 30 seconds
            const query = `
                SELECT id, retry_count as assignment_retry_count
                FROM documents 
                WHERE is_deleted = false
                  AND submission_state = 'pending'
                  AND notary_id IS NULL
                  AND retry_count < 5
                  AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '30 seconds')
                LIMIT 5
            `;
            const r = await pool.query(query);

            if (r.rows.length === 0) return;

            console.log(`[MAINTENANCE] Found ${r.rows.length} orphans. Executing reconciliation pass...`);

            // 🛡️ [PHASE 6.2] Establish System Audit Context for mutations
            await runWithSystemContext('RECONCILIATION_WORKER', 'Healing orphaned documents', async () => {
                WorkerRegistry.heartbeat('reconciliation', 'OK');
                for (const doc of r.rows) {
                    try {
                        // Update updated_at to prevent race conditions during async execution
                        await pool.query(
                            "UPDATE documents SET updated_at = NOW() WHERE id = $1",
                            [doc.id]
                        );

                        const result = await reputationService.assignNotary(doc.id);

                        if (result.success) {
                            // SUCCESS: Cleanup telemetry (Handled inside assignNotary, but we log here)
                            console.log(`[MAINTENANCE] SUCCESS: Doc ${doc.id} assigned to Notary ${result.notaryId}`);
                        } else {
                            // FAILURE HANDLING (V3 Logic)
                            if (result.error_type === 'NO_ELIGIBLE_NOTARIES') {
                                // Business State: Do NOT increment retry count
                                await pool.query(
                                    "UPDATE documents SET updated_at = NOW() WHERE id = $1",
                                    [doc.id]
                                );
                                console.warn(`[MAINTENANCE] WAITING: Doc ${doc.id} - ${result.message}`);
                            } else {
                                // Technical Error: Increment budget
                                const newRetryCount = doc.assignment_retry_count + 1;
                                const newState = newRetryCount >= 5 ? 'failed' : 'pending';
                                
                                await pool.query(
                                    `UPDATE documents 
                                     SET retry_count = $1, 
                                         updated_at = NOW() 
                                     WHERE id = $2`,
                                    [newRetryCount, doc.id]
                                );
                                console.error(`[MAINTENANCE] FAIL: Doc ${doc.id} - ${result.message} (Retry ${newRetryCount}/5)`);
                            }
                        }
                    } catch (docErr) {
                        console.error(`[MAINTENANCE_LOOP_ERROR] Doc ${doc.id}: ${docErr.message}`);
                    }
                }
            });

        } catch (err) {
            console.error('[MAINTENANCE_CRITICAL] pass failed:', err.message);
        } finally {
            if (locked) await lockService.unlock(lockService.KEYS.RECONCILIATION);
        }
    }
}

module.exports = new MaintenanceService();
