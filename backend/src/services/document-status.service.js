const pool = require('../db/index');
const { Logger } = require('./logger.service');
const logger = new Logger('DOCUMENT_STATUS_SERVICE');

/**
 * 🛡️ DOCUMENT STATUS SERVICE (BBSNS BUNKER V3.8)
 * Responsibility: Authoritative State Machine Kernel for the BBSNS backend.
 * Rule 1: All mutations MUST be atomic (State + Revision lock).
 * Rule 2: All mutations MUST follow the transition map.
 * Rule 3: Fail-Fast on concurrency conflict with truth snapshot.
 */

const ALLOWED_TRANSITIONS = {
    'pending': ['submitted_to_blockchain', 'rejected'],
    'submitted_to_blockchain': ['mined', 'timeout_flagged', 'orphaned_duplicate', 'confirmed'], // Syncworker might hit confirmed directly
    'mined': ['mined_confirmed', 'confirmed'],
    'mined_confirmed': ['confirmed'],
    'timeout_flagged': ['submitted_to_blockchain', 'mined', 'confirmed'],
    'rejected': [], // Terminal
    'confirmed': [], // Terminal
    'orphaned_duplicate': [] // Terminal
};

class DocumentStatusService {
    /**
     * Update document state with atomic revision lock.
     * @param {Object} client - PG Client (for transaction support)
     * @param {number|string} docId - Document ID
     * @param {string} fromState - Expected current state
     * @param {number} fromRevision - Expected current revision
     * @param {string} toState - Desired target state
     * @param {Object} metadata - Additional fields to update (e.g., tx_hash)
     * @returns {Promise<Object>} - Updated document or conflict error
     */
    async updateStatus(client, docId, fromState, fromRevision, toState, metadata = {}, extraWhere = "", extraParams = []) {
        // 1. Transition Guard (Hole 2 Fix)
        const allowed = ALLOWED_TRANSITIONS[fromState] || [];
        if (!allowed.includes(toState) && fromState !== toState) {
            logger.error('INVALID_TRANSITION', { docId, fromState, toState });
            throw new Error(`INVALID_TRANSITION: Cannot move document from '${fromState}' to '${toState}'`);
        }

        // 2. Atomic Update (Hole 1 Fix)
        const entries = Object.entries(metadata);
        let additionalSql = '';
        const params = [toState, docId, fromState, fromRevision];
        
        entries.forEach(([key, val], idx) => {
            // If the value is a string starting with '$', it's a placeholder referring to extraParams
            if (typeof val === 'string' && val.startsWith('$') && !isNaN(val.substring(1))) {
                additionalSql += `, ${key} = ${val}`;
            } else {
                additionalSql += `, ${key} = $${params.length + 1}`;
                params.push(val);
            }
        });

        // Append extraParams at the end of the total params array
        params.push(...extraParams);

        const query = `
            UPDATE documents 
            SET submission_state = $1,
                revision = revision + 1,
                last_status_change = NOW()
                ${additionalSql}
            WHERE id = $2 
              AND submission_state = $3 
              AND revision = $4
              ${extraWhere}
            RETURNING *
        `;

        const result = await client.query(query, params);

        if (result.rowCount === 0) {
            // 3. CONFLICT DETECTION
            const current = await client.query(
                'SELECT submission_state, revision FROM documents WHERE id = $1',
                [docId]
            );
            
            if (current.rows.length === 0) {
                throw new Error('DOCUMENT_NOT_FOUND');
            }

            const { submission_state: actualState, revision: actualRevision } = current.rows[0];
            
            logger.warn('STATE_CONFLICT', { 
                docId, 
                expected: { state: fromState, revision: fromRevision },
                actual: { state: actualState, revision: actualRevision }
            });

            return {
                error: 'STATE_CONFLICT',
                currentState: actualState,
                currentRevision: actualRevision
            };
        }

        const updatedDoc = result.rows[0];
        logger.info('STATE_CHANGE', { 
            docId, 
            from: fromState, 
            to: toState, 
            revision: updatedDoc.revision 
        });

        return { success: true, document: updatedDoc };
    }

    /**
     * Fetch document state snapshot.
     */
    async fetchLatest(docId) {
        const res = await pool.query(
            'SELECT submission_state, revision FROM documents WHERE id = $1',
            [docId]
        );
        return res.rows[0] || null;
    }
}

module.exports = new DocumentStatusService();
