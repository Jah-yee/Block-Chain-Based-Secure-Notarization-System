'use strict';

/**
 * Disputes Route (Phase 7)
 *
 * POST /disputes         - Owner submits a dispute against a notarized document
 * PATCH /disputes/:id/resolve - Admin validates/dismisses a dispute
 *
 * SAFETY: notary_id is always fetched from documents table (Correction 5).
 * Admin input is never trusted for the notary identity.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { requirePrivilege, ROLES, RISK_LEVELS } = require('../middleware/actor');
const reputationService = require('../services/reputation.service');

// ─────────────────────────────────────────────────────
// POST /disputes
// Owner submits a dispute on a document with a reason.
// ─────────────────────────────────────────────────────
router.post('/', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const actor = req.actor;
    if (!actor) return res.status(401).json({ error: 'Actor header required' });

    const { document_id, reason } = req.body;

    if (!document_id || !reason || String(reason).trim() === '') {
      return res.status(400).json({ error: 'document_id and a non-empty reason are required' });
    }

    // Verify the document exists and belongs to this owner
    const docRes = await pool.query(
      `SELECT id, user_id, notary_id, submission_state FROM documents WHERE id = $1 AND is_deleted = false`,
      [parseInt(document_id)]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docRes.rows[0];

    // Only document owner can raise a dispute
    if (Number(doc.user_id) !== Number(actor.id)) {
      return res.status(403).json({ error: 'Only the document owner can raise a dispute' });
    }

    // Document must have been processed (not still pending)
    if (doc.submission_state === 'pending' || doc.submission_state === 'assigned') {
      return res.status(400).json({ error: 'Cannot dispute a document that has not been processed yet' });
    }

    // Prevent duplicate open disputes for the same document
    const existingDisp = await pool.query(
      `SELECT id FROM disputes WHERE document_id = $1 AND status = 'open' LIMIT 1`,
      [document_id]
    );
    if (existingDisp.rows.length > 0) {
      return res.status(409).json({ error: 'An open dispute already exists for this document' });
    }

    const result = await pool.query(
      `INSERT INTO disputes (document_id, submitted_by, reason, status, created_at)
       VALUES ($1, $2, $3, 'open', NOW())
       RETURNING *`,
      [document_id, actor.id, reason.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Dispute creation error:', err);
    res.status(500).json({ error: 'Failed to submit dispute' });
  }
});

// ─────────────────────────────────────────────────────
// GET /disputes  (Admin only — full queue view)
// ─────────────────────────────────────────────────────
router.get('/', requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.LOW }), async (req, res) => {
  try {
    const { status = 'open' } = req.query;
    const result = await pool.query(
      `SELECT d.*, doc.notary_id, u.email AS submitter_email
       FROM disputes d
       JOIN documents doc ON d.document_id = doc.id
       JOIN users u ON d.submitted_by = u.id
       WHERE d.status = $1
       ORDER BY d.created_at DESC`,
      [status]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Dispute fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// ─────────────────────────────────────────────────────
// PATCH /disputes/:id/resolve
// Admin resolves a dispute. If valid=true, fires DISPUTE event on notary.
// Correction 5: notary_id always fetched from documents table.
// ─────────────────────────────────────────────────────
router.patch('/:id/resolve', requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid dispute ID' });

    const { valid } = req.body;
    if (typeof valid !== 'boolean') {
      return res.status(400).json({ error: '"valid" must be a boolean (true = dispute upheld, false = dismissed)' });
    }

    const actor = req.actor;

    // Fetch the dispute record
    const disputeRes = await pool.query(
      `SELECT * FROM disputes WHERE id = $1 AND status = 'open'`,
      [parseInt(id)]
    );

    if (disputeRes.rows.length === 0) {
      return res.status(404).json({ error: 'Open dispute not found' });
    }
    const dispute = disputeRes.rows[0];

    // Correction 5: Fetch notary_id from documents table, NEVER trust dispute input
    const docRes = await pool.query(
      `SELECT notary_id, submission_state FROM documents WHERE id = $1`,
      [dispute.document_id]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Associated document not found' });
    }
    const notaryId = docRes.rows[0].notary_id;

    // Resolve the dispute record
    const newStatus = valid ? 'resolved' : 'dismissed';
    await pool.query(
      `UPDATE disputes SET status = $1, resolved_by = $2 WHERE id = $3`,
      [newStatus, actor.id, id]
    );

    // If valid dispute: fire DISPUTE reputation penalty on the notary
    if (valid && notaryId) {
      await reputationService.handleEvent(
        notaryId,
        'DISPUTE',
        dispute.document_id
      );
      console.log(`[DISPUTE] Valid dispute resolved | notaryId=${notaryId} | docId=${dispute.document_id} | penaltyApplied=true`);
    } else if (!valid) {
      console.log(`[DISPUTE] Dispute dismissed | id=${id} | no reputation change`);
    } else {
      console.warn(`[DISPUTE] Valid dispute but no notary on document | docId=${dispute.document_id}`);
    }

    res.json({ message: `Dispute ${newStatus}`, dispute_id: parseInt(id), notary_penalized: valid && !!notaryId });
  } catch (err) {
    console.error('Dispute resolution error:', err);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

module.exports = router;
