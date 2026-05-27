const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic } = require('../middleware/actor');
const Joi = require('joi');

// router.use(loadActor) deprecated for zero-trust compliance

const { withDomain, withAction, withMutation } = require('../middleware/policy');

const transactionApprovalSchema = Joi.object({
    document_id: Joi.number().integer().required(),
    status: Joi.string().valid('approved', 'rejected').required(),
    note: Joi.string().allow('').optional(),
    signature: Joi.string().required()
});

// POST /transactions - Create a transaction (Approval/Rejection flow)
router.post('/', withDomain('TRANSACTIONS'), requirePrivilege({ capability: 'TX_APPROVE_VOTE' }), withAction('TX_APPROVE_VOTE'), withMutation(), async (req, res) => {
    try {
        const actor = req.actor;
        if (!actor) return res.status(401).json({ error: 'Actor header required' });

        // Validate role: only notary or admin can approve/reject
        if (!['notary', 'admin'].includes(actor.role)) {
            return res.status(403).json({ error: 'Only notaries or admins can approve or reject' });
        }

        // Validate request body
        const { error, value } = transactionApprovalSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }
        const { document_id, status, note, signature } = value;

        // Check if document exists and get current status
        const docRes = await pool.query('SELECT submission_state, chain_confirmed FROM documents WHERE id = $1', [document_id]);
        if (docRes.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const doc = docRes.rows[0];

        // Prevent multiple approvals/rejections for the same document
        if (doc.chain_confirmed || doc.submission_state === 'submitted_to_blockchain' || doc.submission_state === 'rejected') {
            return res.status(409).json({ error: 'Document already has an approval, rejection, or is in-flight' });
        }

        // Insert transaction & Update document atomically
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const insertRes = await client.query(
                `INSERT INTO ntkr_transactions (user_id, document_id, tx_type, amount, tx_hash, status, note, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
                [actor.id, document_id, 'approval', 0, signature, 'success', note || '']
            );

            const dbState = status === 'rejected' ? 'rejected' : 'submitted_to_blockchain';

            await client.query(
                'UPDATE documents SET submission_state = $1, updated_at = NOW() WHERE id = $2',
                [dbState, document_id]
            );

            await client.query('COMMIT');

            res.status(201).json({
                transaction_id: insertRes.rows[0].id,
                document_id: document_id,
                status: status,
                actor_role: actor.role,
                note: note || '',
                created_at: insertRes.rows[0].created_at
            });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

// GET /transactions - Get transactions with filters
router.get('/', requirePrivilege({ capability: 'TX_LIST' }), async (req, res) => {
    console.log('[DEBUG_TX] Hit GET /transactions');
    try {
        const actor = req.actor;
        if (!actor) return res.status(401).json({ error: 'Actor header required' });
        if (actor.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const { document_id, user_id, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        let baseQuery = 'SELECT * FROM ntkr_transactions';
        const conditions = [];
        const params = [];

        if (document_id) {
            params.push(document_id);
            conditions.push(`document_id = $${params.length}`);
        }
        if (user_id) {
            params.push(user_id);
            conditions.push(`user_id = $${params.length}`);
        }

        if (conditions.length > 0) {
            baseQuery += ' WHERE ' + conditions.join(' AND ');
        }

        params.push(parseInt(limit));
        params.push(parseInt(offset));
        baseQuery += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const r = await pool.query(baseQuery, params);
        res.json(r.rows.map(row => ({
            transaction_id: row.id,
            document_id: row.document_id,
            status: row.status,
            note: row.note || '',
            created_at: row.created_at
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// GET /transactions/:id - Get specific transaction
router.get('/:id', requirePrivilege({ capability: 'TX_READ' }), async (req, res) => {
    try {
        const { id } = req.params;
        const r = await pool.query('SELECT * FROM ntkr_transactions WHERE id=$1', [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
        const tx = r.rows[0];
        if (!req.actor) return res.status(401).json({ error: 'Actor header required' });
        if (req.actor.role !== 'admin' && Number(req.actor.id) !== Number(tx.user_id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        res.json({ ...tx, amount: parseFloat(tx.amount) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch transaction' });
    }
});

// Immutability Guards — explicitly marked for audit compliance
router.put('/:id', allowPublic, (req, res) => {
    res.status(405).json({ error: 'Transactions are immutable.' });
});

router.delete('/:id', allowPublic, (req, res) => {
    res.status(405).json({ error: 'Transactions cannot be deleted.' });
});

module.exports = router;
