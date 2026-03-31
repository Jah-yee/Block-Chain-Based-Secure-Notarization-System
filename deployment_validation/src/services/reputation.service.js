'use strict';

/**
 * Reputation Service (Phase 4)
 * 
 * Handles:
 *   - handleEvent: real-time scoring on notary actions
 *   - assignNotary: weighted document assignment
 * 
 * SAFETY RULES:
 *  - Never compute effective_reputation here (worker-only)
 *  - Always use atomic SQL increments for raw_reputation
 *  - All failures are logged, never thrown to callers
 */

const pool = require('../db/index');

// ─────────────────────────────────────────────────────
// Score Map
// REJECT > APPROVE because formal rejection requires 
// more scrutiny and thorough review by the notary.
// ─────────────────────────────────────────────────────
const SCORE_MAP = {
  APPROVE: 10,
  REJECT: 15,
  DISPUTE: -25,
  GOVERNANCE: 5,
};

/**
 * handleEvent
 * Records a reputation event and atomically updates raw_reputation.
 *
 * @param {number} userId     - ID of the notary being scored
 * @param {string} type       - 'APPROVE' | 'REJECT' | 'DISPUTE' | 'GOVERNANCE'
 * @param {number|null} documentId - Associated document (nullable for GOVERNANCE)
 * @param {object} meta       - Extra context ({ rejection_reason })
 */
async function handleEvent(userId, type, documentId = null, meta = {}) {
  if (!SCORE_MAP.hasOwnProperty(type)) {
    console.error(`[REPUTATION] Unknown event type: ${type}`);
    return;
  }

  // Correction 1: REJECT requires a valid rejection_reason
  if (type === 'REJECT') {
    if (!meta.rejection_reason || String(meta.rejection_reason).trim() === '') {
      console.error(`[REPUTATION] REJECT event blocked: rejection_reason is empty | userId=${userId} | docId=${documentId}`);
      return;
    }
  }

  const scoreDelta = SCORE_MAP[type];

  try {
    // Safeguard S3: Prevent duplicate events for same (document_id, event_type)
    if (documentId !== null && (type === 'APPROVE' || type === 'REJECT')) {
      const dupCheck = await pool.query(
        `SELECT id FROM reputation_events WHERE document_id = $1 AND event_type = $2 LIMIT 1`,
        [documentId, type]
      );
      if (dupCheck.rows.length > 0) {
        console.warn(`[REPUTATION] Duplicate event skipped | userId=${userId} | docId=${documentId} | type=${type}`);
        return;
      }
    }

    // Correction 6: Atomic SQL increment — no read-modify-write
    await pool.query(
      `UPDATE users 
       SET raw_reputation = raw_reputation + $1, last_active_at = NOW()
       WHERE id = $2`,
      [scoreDelta, userId]
    );

    // Insert immutable audit record
    await pool.query(
      `INSERT INTO reputation_events (user_id, event_type, score_delta, document_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, type, scoreDelta, documentId]
    );

    console.log(`[REPUTATION_EVENT] userId=${userId} | type=${type} | delta=${scoreDelta > 0 ? '+' : ''}${scoreDelta} | docId=${documentId}`);
  } catch (err) {
    // Never throw — reputation failure must not block document operations
    console.error(`[REPUTATION] handleEvent failed | userId=${userId} | type=${type} | error=${err.message}`);
  }
}

/**
 * assignNotary
 * Selects a notary via weighted random selection (or bootstrap direct).
 * Uses pre-computed effective_reputation — never recomputes here.
 *
 * @param {number} documentId - ID of the document to assign
 * @returns {number|null} assigned notary user_id, or null on failure
 */
async function assignNotary(documentId) {
  try {
    // Correction 8: Eligible notaries must be active, non-banned notaries
    const notaryRes = await pool.query(
      `SELECT id, effective_reputation 
       FROM users 
       WHERE role = 'notary' 
         AND (is_active IS NULL OR is_active = true)
         AND (is_banned IS NULL OR is_banned = false)
       ORDER BY id ASC`
    );

    const notaries = notaryRes.rows;

    if (notaries.length === 0) {
      console.warn(`[ASSIGNMENT] No eligible notaries available | docId=${documentId}`);
      return null;
    }

    let selectedNotary;

    // Phase 9 / Bootstrap Mode: fewer than 3 notaries
    if (notaries.length < 3) {
      // Correction 3: Random selection, not lowest ID
      selectedNotary = notaries[Math.floor(Math.random() * notaries.length)];
      console.log(`[ASSIGNMENT] Bootstrap mode | notaries=${notaries.length} | selected=${selectedNotary.id} | docId=${documentId}`);
    } else {
      // Normal Mode: Weighted random by effective_reputation
      // Safeguard S1: Clamp any negative reputation to 0
      const weights = notaries.map(n => Math.max(0, parseFloat(n.effective_reputation) || 0));
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      if (totalWeight === 0) {
        // Correction 2: All weights zero → fallback to equal random
        selectedNotary = notaries[Math.floor(Math.random() * notaries.length)];
        console.log(`[ASSIGNMENT] Equal-random fallback (all rep=0) | selected=${selectedNotary.id} | docId=${documentId}`);
      } else {
        // Perform weighted random selection
        let rand = Math.random() * totalWeight;
        selectedNotary = notaries[notaries.length - 1]; // fallback to last
        for (let i = 0; i < notaries.length; i++) {
          rand -= weights[i];
          if (rand <= 0) {
            selectedNotary = notaries[i];
            break;
          }
        }
        console.log(`[ASSIGNMENT] Weighted selection | selected=${selectedNotary.id} | rep=${selectedNotary.effective_reputation} | docId=${documentId}`);
      }
    }

    // Safeguard S4: Race condition guard — only assign if still unassigned
    const updateRes = await pool.query(
      `UPDATE documents 
       SET notary_id = $1, submission_state = 'assigned', updated_at = NOW()
       WHERE id = $2 AND notary_id IS NULL
       RETURNING id`,
      [selectedNotary.id, documentId]
    );

    if (updateRes.rowCount === 0) {
      // Another process assigned this doc first — abort silently
      console.warn(`[ASSIGNMENT] Race condition: doc already assigned | docId=${documentId}`);
      return null;
    }

    console.log(`[ASSIGNMENT] SUCCESS | docId=${documentId} → notaryId=${selectedNotary.id}`);
    return selectedNotary.id;

  } catch (err) {
    // Correction 7: Failure leaves document in 'pending', never throws
    console.error(`[ASSIGNMENT] assignNotary failed | docId=${documentId} | error=${err.message}`);
    return null;
  }
}

module.exports = { handleEvent, assignNotary };
