'use strict';

/**
 * Reputation Worker (Phase 4)
 *
 * Runs every 5 minutes via setInterval.
 * Computes: effective_reputation = raw_reputation × activity_factor × freshness_factor
 * 
 * Formulas:
 *   recent_actions = COUNT(events in last 7 days)
 *   activity_factor = min(1.0, recent_actions / 20)
 *   inactive_minutes = (NOW - last_active_at) / 60000
 *   freshness_factor = exp(-0.001 × inactive_minutes)   [Safeguard S2: if NULL → 1.0]
 *
 * Anomaly detection (non-bootstrap only):
 *   Penalize −10 raw_reputation if |notary_rate - system_avg| > 0.40
 */

const pool = require('../db/index');
const lockService = require('../services/lock.service');
const { runWithSystemContext } = require('../middleware/actor');
const WorkerRegistry = require('../services/worker-registry.service');

const WORKER_INTERVAL_MS = parseInt(process.env.REPUTATION_INTERVAL_MS) || 5 * 60 * 1000;      // 5 minutes
const BOOTSTRAP_THRESHOLD = 3;                   // < 3 notaries → bootstrap mode

// 🛡️ REPUTATION SYSTEM CONSTANTS (Phase 4)
const ACTIVITY_WINDOW_DAYS = 7;
const ACTIVITY_NORMALIZER = 20;                  // 20 actions = 100% activity factor
const FRESHNESS_DECAY = 0.001;                   // fresh = exp(-0.001 * min_inactive)
const ANOMALY_DEVIATION_THRESHOLD = 0.40;        // > 40% deviation from avg = penalty
const ANOMALY_PENALTY = 10;                      // -10 raw reputation

async function runReputationWorker() {
  const lockId = 1002; // REPUTATION
  if (!(await lockService.tryLock(lockId))) {
      console.log('[WORKER] Skip reputation recalculation: Another instance is processing.');
      return;
  }

  console.log('[WORKER] Starting reputation recalculation cycle...');
  const cycleStart = Date.now();

  try {
    // 🛡️ [PHASE 6.2] Wrap reputation cycle in System Audit Context
    await runWithSystemContext('REPUTATION_WORKER', 'Recalculating effective reputation and checking anomalies', async () => {
      WorkerRegistry.heartbeat('reputation', 'OK');

      // ─────────────────────────────────────
      // Fetch all eligible notaries
      // ─────────────────────────────────────
      const notaryRes = await pool.query(
        `SELECT id, raw_reputation, last_active_at
         FROM users 
         WHERE role = 'notary'
           AND (is_active IS NULL OR is_active = true)
           AND (is_banned IS NULL OR is_banned = false)`
      );

      const notaries = notaryRes.rows;
      const isBootstrap = notaries.length < BOOTSTRAP_THRESHOLD;

      console.log(`[WORKER] Notaries: ${notaries.length} | Bootstrap: ${isBootstrap}`);

      if (notaries.length === 0) {
        console.log('[WORKER] No notaries to process. Skipping cycle.');
        return;
      }

      // ─────────────────────────────────────
      // Phase 4 Anomaly Detection (non-bootstrap)
      // Compute system-wide approval rate before per-user loop
      // ─────────────────────────────────────
      let systemApprovalRate = null;

      if (!isBootstrap) {
        const sysRes = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_type = 'APPROVE') AS total_approvals,
             COUNT(*) FILTER (WHERE event_type = 'REJECT') AS total_rejections
           FROM reputation_events
           WHERE event_type IN ('APPROVE', 'REJECT')`
        );
        const totalApprovals = parseInt(sysRes.rows[0].total_approvals) || 0;
        const totalRejections = parseInt(sysRes.rows[0].total_rejections) || 0;
        const totalActions = totalApprovals + totalRejections;
        systemApprovalRate = totalActions > 0 ? totalApprovals / totalActions : null;
        console.log(`[WORKER] System approval rate: ${systemApprovalRate !== null ? (systemApprovalRate * 100).toFixed(1) + '%' : 'N/A (no data)'}`);
      }

      // ─────────────────────────────────────
      // Per-notary recalculation
      // ─────────────────────────────────────
      const nowMs = Date.now();

      for (const notary of notaries) {
        try {
          // 1. recent_actions: events in last 7 days
          const activityRes = await pool.query(
            `SELECT COUNT(*) AS cnt 
             FROM reputation_events 
             WHERE user_id = $1 
               AND created_at > NOW() - INTERVAL '${ACTIVITY_WINDOW_DAYS} days'`,
            [notary.id]
          );
          const recentActions = parseInt(activityRes.rows[0].cnt) || 0;
          const activityFactor = Math.min(1.0, recentActions / ACTIVITY_NORMALIZER);

          // 2. freshness_factor: Safeguard S2 — NULL last_active_at → 1.0
          let freshnessFactor = 1.0;
          if (notary.last_active_at) {
            const lastActiveMs = new Date(notary.last_active_at).getTime();
            const inactiveMinutes = Math.max(0, (nowMs - lastActiveMs) / 60000);
            freshnessFactor = Math.exp(-FRESHNESS_DECAY * inactiveMinutes);
          }

          // 3. effective_reputation
          const rawRep = parseFloat(notary.raw_reputation) || 0;
          const effectiveRep = rawRep * activityFactor * freshnessFactor;

          // Guard against NaN/Infinity
          if (!isFinite(effectiveRep)) {
            console.error(`[WORKER] NaN/Infinity detected for userId=${notary.id} | rawRep=${rawRep} | activity=${activityFactor} | freshness=${freshnessFactor} — skipping`);
            continue;
          }

          console.log(`[WORKER_UPDATE] userId=${notary.id} | raw=${rawRep.toFixed(2)} | activity=${activityFactor.toFixed(2)} | freshness=${freshnessFactor.toFixed(4)} | effective=${effectiveRep.toFixed(2)}`);

          // 4. Anomaly Detection (non-bootstrap only)
          if (!isBootstrap && systemApprovalRate !== null) {
            const anomalyRes = await pool.query(
              `SELECT
                 COUNT(*) FILTER (WHERE event_type = 'APPROVE') AS approvals,
                 COUNT(*) FILTER (WHERE event_type = 'REJECT') AS rejections
               FROM reputation_events
               WHERE user_id = $1 AND event_type IN ('APPROVE', 'REJECT')`,
              [notary.id]
            );
            const approvals = parseInt(anomalyRes.rows[0].approvals) || 0;
            const rejections = parseInt(anomalyRes.rows[0].rejections) || 0;
            const notaryTotal = approvals + rejections;

            if (notaryTotal >= 5) { // Only flag notaries with sufficient history
              const notaryApprovalRate = approvals / notaryTotal;
              const deviation = Math.abs(notaryApprovalRate - systemApprovalRate);

              if (deviation > ANOMALY_DEVIATION_THRESHOLD) {
                console.warn(`[WORKER] ANOMALY DETECTED | userId=${notary.id} | notaryRate=${(notaryApprovalRate * 100).toFixed(1)}% | systemRate=${(systemApprovalRate * 100).toFixed(1)}% | deviation=${(deviation * 100).toFixed(1)}%`);
                // Atomic penalty (Correction 6)
                await pool.query(
                  `UPDATE users SET raw_reputation = raw_reputation - $1 WHERE id = $2`,
                  [ANOMALY_PENALTY, notary.id]
                );
              }
            }
          }

          // 5. Write effective_reputation (Safety Rule: only written here, never in routes)
          await pool.query(
            `UPDATE users SET effective_reputation = $1 WHERE id = $2`,
            [effectiveRep, notary.id]
          );

        } catch (perUserErr) {
          console.error(`[WORKER] Per-user error | userId=${notary.id} | error=${perUserErr.message}`);
        }
      }

      const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(2);
      console.log(`[WORKER] Cycle complete | ${notaries.length} notaries processed | ${elapsed}s elapsed`);
    });

  } catch (err) {
    console.error(`[WORKER] Fatal cycle error: ${err.message}`);
    WorkerRegistry.heartbeat('reputation', 'FAIL', { error: err.message });
  } finally {
    await lockService.unlock(1002);
  }
}

// Only start the interval when required as a module (not during tests)
function startReputationWorker() {
  console.log(`[WORKER] Reputation Worker started. Interval: ${WORKER_INTERVAL_MS / 1000}s`);
  runReputationWorker(); // Run immediately on start
  return setInterval(runReputationWorker, WORKER_INTERVAL_MS);
}

module.exports = { runReputationWorker, startReputationWorker };
