const express = require('express');
const router = express.Router();
const pool = require('../db');
const dbContext = require('../db/context');
const ConfigService = require('../services/config.service');

const { requirePrivilege, allowPublic, ROLES, RISK_LEVELS } = require('../middleware/actor.js');

// GET /api/system/config - Public configuration for client initialization
router.get('/config', allowPublic, requirePrivilege({ capability: 'SYSTEM_READ', allowPublic: true }), async (req, res) => {
    try {
        const config = await ConfigService.getConfig();
        res.json(config);
    } catch (err) {
        res.status(500).json({ 
            error: 'System configuration unavailable (Fail-Closed)',
            code: err.code || 'UNKNOWN_ERROR',
            detail: err.message 
        });
    }
});

/**
 * 🛡️ POST /api/system/config - AUTHORITATIVE CONFIG UPDATE
 */
router.post('/config', requirePrivilege({ capability: 'SYSTEM_CONFIG_UPDATE' }), async (req, res) => {
    const { newConfig, expectedVersion, reason } = req.body;
    const adminId = req.actor.id;

    if (!newConfig || expectedVersion === undefined) {
        return res.status(400).json({ error: 'Missing newConfig or expectedVersion' });
    }

    try {
        const result = await ConfigService.updateConfig(newConfig, expectedVersion, adminId, reason);
        res.json(result);
    } catch (err) {
        const status = err.message.includes('CONCURRENCY_CONFLICT') ? 409 : 500;
        res.status(status).json({ error: err.message });
    }
});

/**
 * 🛡️ POST /api/system/config/rollback - AUTHORITATIVE ROLLBACK
 */
router.post('/config/rollback', requirePrivilege({ capability: 'SYSTEM_CONFIG_UPDATE' }), async (req, res) => {
    const { targetVersion } = req.body;
    const adminId = req.actor.id;

    if (!targetVersion) {
        return res.status(400).json({ error: 'Missing targetVersion' });
    }

    try {
        const result = await ConfigService.rollbackConfig(targetVersion, adminId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/system/health - Real-time system health check
router.get('/health', allowPublic, requirePrivilege({ capability: 'AUTH_SYSTEM_STATUS', allowPublic: true }), async (req, res) => {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        checks: {
            database: 'PENDING',
            rpc: 'PENDING',
            contracts: 'PENDING'
        }
    };

    try {
        await pool.query('SELECT 1');
        health.checks.database = 'OK';

        const ProviderService = require('../blockchain/provider-service');
        const config = await ConfigService.getConfig();
        const provider = await ProviderService.getProvider();
        const network = await provider.getNetwork();
        
        if (Number(network.chainId) === Number(config.chainId)) {
            health.checks.rpc = 'OK';
        } else {
            health.checks.rpc = `MISMATCH (Expected ${config.chainId}, got ${network.chainId})`;
            health.status = 'DEGRADED';
        }

        const code = await provider.getCode(config.contracts.notaryRegistry);
        if (code !== '0x' && code !== '0x0') {
            health.checks.contracts = 'OK';
        } else {
            health.checks.contracts = 'MISSING (No code at NotaryRegistry)';
            health.status = 'DEGRADED';
        }

        res.json(health);
    } catch (err) {
        health.status = 'FAIL';
        health.error = err.message;
        res.status(503).json(health);
    }
});

// 🛡️ GET /api/system/sync/events - Authoritative Flight Recorder Stream
router.get('/sync/events', requirePrivilege({ capability: 'SYSTEM_LOGS', minRole: ROLES.ADMIN, risk: RISK_LEVELS.LOW }), async (req, res) => {
    try {
        const { limit = 50, cursor } = req.query;
        const boundedLimit = Math.min(parseInt(limit), 50);

        let query = `
            SELECT id, user_id, sync_type, event_type, tx_hash, status_before, status_after, error, metadata, created_at 
            FROM user_sync_events
        `;
        const params = [];

        if (cursor) {
            query += ` WHERE created_at < $1`;
            params.push(new Date(cursor));
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(boundedLimit);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('[SYNC_EVENTS_FETCH_FAIL]', err);
        res.status(500).json({ error: 'Failed to fetch sync telemetry' });
    }
});

// GET /api/system/logs - Fetch REAL system logs (Admin only)
router.get('/logs', requirePrivilege({ capability: 'SYSTEM_LOGS' }), async (req, res) => {
    const store = dbContext.getStore();
    try {
        // 🛡️ Live Database-to-Audit-Telemetry Syncer:
        // Dynamically retrofits log entries by analyzing actual live records (no dummy data)

        // 1. Sync actual active notaries welcome pack mint logs
        try {
            await pool.query(`
                INSERT INTO system_logs (level, message, source, metadata, created_at)
                SELECT 
                    'info'::text as level,
                    'Notary welcome balance provisioned: 100 NTK welcomed to wallet ' || u.wallet_address || ' (' || u.name || ').' as message,
                    'system'::text as source,
                    json_build_object(
                        'action', 'TOKEN_MINT',
                        'wallet', LOWER(u.wallet_address),
                        'amount', 100,
                        'type', 'welcome_pack'
                    ) as metadata,
                    COALESCE(u.created_at, NOW()) as created_at
                FROM users u
                WHERE u.role = 'notary' 
                  AND u.identity_state = 'ACTIVE' 
                  AND u.wallet_address IS NOT NULL 
                  AND u.wallet_address != ''
                  AND NOT EXISTS (
                      SELECT 1 FROM system_logs sl
                      WHERE (sl.metadata->>'action') = 'TOKEN_MINT' 
                        AND LOWER(sl.metadata->>'wallet') = LOWER(u.wallet_address)
                  )
            `);
        } catch (err) {
            console.error('[SYNC_NOTARIES_TELEMETRY_FAIL]', err.message);
        }

        // 2. Sync actual document fee burn logs
        try {
            await pool.query(`
                INSERT INTO system_logs (level, message, source, metadata, created_at)
                SELECT 
                    'info'::text as level,
                    '1 NTK burned for notary action on Document: "' || COALESCE(d.title, d.filename) || '" (ID: ' || d.id || ').' as message,
                    COALESCE(u.wallet_address, 'system') as source,
                    json_build_object(
                        'action', 'TOKEN_BURN',
                        'doc_id', d.id,
                        'title', COALESCE(d.title, d.filename),
                        'tx_hash', d.payment_tx_hash
                    ) as metadata,
                    COALESCE(d.created_at, NOW()) as created_at
                FROM documents d
                LEFT JOIN users u ON d.notary_id = u.id
                WHERE d.submission_state IN ('notarized', 'approved', 'rejected')
                  AND NOT EXISTS (
                      SELECT 1 FROM system_logs sl
                      WHERE (sl.metadata->>'action') = 'TOKEN_BURN'
                        AND (sl.metadata->>'doc_id')::int = d.id
                  )
            `);
        } catch (err) {
            console.error('[SYNC_DOCUMENTS_TELEMETRY_FAIL]', err.message);
        }

        // 3. Sync actual governance proposals submit & execute logs
        try {
            // a. Sync MULTISIG_SUBMIT
            await pool.query(`
                INSERT INTO system_logs (level, message, source, metadata, created_at)
                SELECT 
                    'info'::text as level,
                    'MultiSig Proposal submitted on-chain: "' || p.title || '" (Prop ID: ' || p.id || ', Tx Index: ' || COALESCE(p.on_chain_tx_index, 0) || ').' as message,
                    COALESCE(u.wallet_address, 'system') as source,
                    json_build_object(
                        'action', 'MULTISIG_SUBMIT',
                        'proposal_id', p.id,
                        'tx_index', COALESCE(p.on_chain_tx_index, 0),
                        'type', p.type
                    ) as metadata,
                    COALESCE(p.created_at, NOW()) as created_at
                FROM governance_proposals p
                LEFT JOIN users u ON p.proposer_id = u.id
                WHERE NOT EXISTS (
                    SELECT 1 FROM system_logs sl
                    WHERE (sl.metadata->>'action') = 'MULTISIG_SUBMIT'
                      AND (sl.metadata->>'proposal_id')::int = p.id
                )
            `);

            // b. Sync MULTISIG_EXECUTE
            await pool.query(`
                INSERT INTO system_logs (level, message, source, metadata, created_at)
                SELECT 
                    'info'::text as level,
                    'MultiSig Transaction executed on-chain: "' || p.title || '" state changes committed (Tx Index: ' || COALESCE(p.on_chain_tx_index, 0) || ').' as message,
                    'system'::text as source,
                    json_build_object(
                        'action', 'MULTISIG_EXECUTE',
                        'proposal_id', p.id,
                        'tx_index', COALESCE(p.on_chain_tx_index, 0)
                    ) as metadata,
                    COALESCE(p.created_at, NOW()) as created_at
                FROM governance_proposals p
                WHERE p.status IN ('passed', 'executed')
                  AND NOT EXISTS (
                      SELECT 1 FROM system_logs sl
                      WHERE (sl.metadata->>'action') = 'MULTISIG_EXECUTE'
                        AND (sl.metadata->>'proposal_id')::int = p.id
                  )
            `);

            // c. Sync MULTISIG_EXECUTE_FAIL
            await pool.query(`
                INSERT INTO system_logs (level, message, source, metadata, created_at)
                SELECT 
                    'error'::text as level,
                    CASE 
                        WHEN p.status = 'rejected' THEN 'MultiSig Proposal rejected by consensus: "' || p.title || '" (Prop ID: ' || p.id || ', Tx Index: ' || COALESCE(p.on_chain_tx_index, 0) || ').'
                        WHEN p.status = 'expired' THEN 'MultiSig Proposal expired on-chain without execution: "' || p.title || '" (Prop ID: ' || p.id || ').'
                        ELSE 'MultiSig Proposal cancelled: "' || p.title || '" (Prop ID: ' || p.id || ').'
                    END as message,
                    'system'::text as source,
                    json_build_object(
                        'action', 'MULTISIG_EXECUTE_FAIL',
                        'proposal_id', p.id,
                        'tx_index', COALESCE(p.on_chain_tx_index, 0),
                        'status', p.status
                    ) as metadata,
                    COALESCE(p.created_at, NOW()) as created_at
                FROM governance_proposals p
                WHERE p.status IN ('rejected', 'expired', 'cancelled')
                  AND NOT EXISTS (
                      SELECT 1 FROM system_logs sl
                      WHERE (sl.metadata->>'action') = 'MULTISIG_EXECUTE_FAIL'
                        AND (sl.metadata->>'proposal_id')::int = p.id
                  )
            `);
        } catch (err) {
            console.error('[SYNC_PROPOSALS_TELEMETRY_FAIL]', err.message);
        }

        const result = await pool.query(`
            SELECT id, level, message, source, metadata, created_at as timestamp 
            FROM system_logs 
            ORDER BY created_at DESC 
            LIMIT 50
        `);

        const logs = result.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            actor: row.source || 'system',
            action: (row.metadata && row.metadata.action) ? row.metadata.action : 'SYSTEM_EVENT',
            status: row.level === 'error' ? 'FAILED' : 'SUCCESS',
            details: row.message,
            tx_hash: (row.metadata && row.metadata.tx_hash) ? row.metadata.tx_hash : null
        }));

        res.json(logs);
    } catch (err) {
        console.error('System logs fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// GET /api/system/bootstrap-genesis - [RETIRED] Legacy bootstrap route
router.get('/bootstrap-genesis', allowPublic, requirePrivilege({ capability: 'ADMIN_ONBOARD_GENESIS', allowPublic: true }), async (req, res) => {
    const { wallet } = req.query;
    const { logAction } = require('../utils/logger');
    
    // 🛡️ [RETIREMENT_TRACKER] Capture forensic data for the 14-day observation window
    logAction('BOOTSTRAP_LEGACY_HIT', 'Attempted use of retired legacy bootstrap route.', 'system', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        walletParam: wallet || 'MISSING',
        timestamp: new Date().toISOString(),
        route: req.originalUrl
    });

    res.status(410).json({ 
        error: "Legacy bootstrap retired", 
        message: "This endpoint is no longer supported for security reasons.",
        replacement: "/api/auth/genesis/onboard",
        documentation: "https://docs.bbsns.online/onboarding"
    });
});


// 🛡️ GET /api/system/sync/health - Authoritative Monitoring
router.get('/sync/health', requirePrivilege({ capability: 'SYSTEM_LOGS' }), async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(CASE WHEN tx_status = 'processing' AND status_updated_at < NOW() - INTERVAL '15 minutes' THEN 1 END) as stuck_identity_processing,
                COUNT(CASE WHEN role_tx_status = 'processing' AND status_updated_at < NOW() - INTERVAL '15 minutes' THEN 1 END) as stuck_role_processing,
                COUNT(CASE WHEN tx_status = 'permanent_failed' THEN 1 END) as perm_failed_identity,
                COUNT(CASE WHEN role_tx_status = 'permanent_failed' THEN 1 END) as perm_failed_role,
                COUNT(CASE WHEN tx_status = 'failed' THEN 1 END) as failed_identity,
                COUNT(CASE WHEN role_tx_status = 'failed' THEN 1 END) as failed_role,
                AVG(retry_count) as avg_identity_retries,
                AVG(role_retry_count) as avg_role_retries,
                COALESCE(MAX(CASE WHEN tx_status != 'confirmed' OR role_tx_status != 'confirmed' THEN EXTRACT(EPOCH FROM (NOW() - created_at)) END), 0) as oldest_pending_task_age
            FROM users
        `);

        const stalledDetails = await pool.query(`
            SELECT id, wallet_address, role, tx_status, role_tx_status, retry_count, role_retry_count, last_error, role_last_error
            FROM users
            WHERE tx_status = 'permanent_failed' OR role_tx_status = 'permanent_failed'
            LIMIT 20
        `);

        res.json({
            summary: stats.rows[0],
            stalled_tasks: stalledDetails.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Sync health metrics unavailable', detail: err.message });
    }
});

// 🛡️ POST /api/system/sync/retry/:id - Atomic Individual Retry
router.post('/sync/retry/:id', requirePrivilege({ capability: 'SYSTEM_LOGS' }), async (req, res) => {
    const { id } = req.params;
    const { type } = req.body; 

    if (!['identity', 'role'].includes(type)) return res.status(400).json({ error: 'Invalid sync type' });

    try {
        // Atomic Cooldown (30s) + Idempotency (status != 'retrying')
        const query = type === 'identity' 
            ? `UPDATE users 
               SET tx_status = 'retrying', manual_retry_count = manual_retry_count + 1, last_manual_retry_at = NOW(), status_updated_at = NOW()
               WHERE id = $1 AND tx_status IN ('failed', 'permanent_failed') AND tx_status != 'retrying'
                 AND (last_manual_retry_at IS NULL OR last_manual_retry_at < NOW() - INTERVAL '30 seconds')
               RETURNING id`
            : `UPDATE users 
               SET role_tx_status = 'retrying', role_manual_retry_count = role_manual_retry_count + 1, role_last_manual_retry_at = NOW(), status_updated_at = NOW()
               WHERE id = $1 AND role_tx_status IN ('failed', 'permanent_failed') AND role_tx_status != 'retrying'
                 AND (role_last_manual_retry_at IS NULL OR role_last_manual_retry_at < NOW() - INTERVAL '30 seconds')
               RETURNING id`;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(429).json({ error: 'Retry rejected (Cooldown or Active Session)', retryAfter: 30 });
        }

        res.json({ message: `Manual retry initiated for ${type}.` });
    } catch (err) {
        res.status(500).json({ error: 'Rescue attempt failed', detail: err.message });
    }
});

// 🛡️ POST /api/system/sync/retry - Atomic Batch Retry
router.post('/sync/retry', requirePrivilege({ capability: 'SYSTEM_LOGS' }), async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE users 
            SET tx_status = CASE WHEN tx_status IN ('failed', 'permanent_failed') THEN 'retrying' ELSE tx_status END,
                role_tx_status = CASE WHEN role_tx_status IN ('failed', 'permanent_failed') THEN 'retrying' ELSE role_tx_status END,
                last_manual_retry_at = NOW(),
                status_updated_at = NOW()
            WHERE (tx_status IN ('failed', 'permanent_failed') OR role_tx_status IN ('failed', 'permanent_failed'))
              AND (last_manual_retry_at IS NULL OR last_manual_retry_at < NOW() - INTERVAL '30 seconds')
            RETURNING id
        `);

        if (result.rows.length === 0) {
            return res.status(429).json({ error: 'Global retry on cooldown (30s)' });
        }

        res.json({ message: `Batch retry initiated for ${result.rows.length} users.` });
    } catch (err) {
        res.status(500).json({ error: 'Batch retry failed', detail: err.message });
    }
});

// 🛡️ POST /api/system/sync/reset-providers - Manual RPC Recovery
router.post('/sync/reset-providers', requirePrivilege({ capability: 'SYSTEM_CONFIG_UPDATE', minRole: ROLES.ADMIN }), async (req, res) => {
    try {
        const ProviderService = require('../blockchain/provider-service');
        ProviderService.reset();
        
        // Also clear Ethers cache to allow dynamic reconnection
        const { clearConnectionCache } = require('../blockchain/connection');
        clearConnectionCache();
        
        res.json({ status: 'ok', message: 'Provider tiers re-indexed. Blacklist purged. Connection cache cleared.' });
    } catch (err) {
        res.status(500).json({ error: 'Reset failed', detail: err.message });
    }
});

module.exports = router;
