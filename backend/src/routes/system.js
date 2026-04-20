const express = require('express');
const router = express.Router();
const pool = require('../db');
const dbContext = require('../db/context');
const ConfigService = require('../services/config.service');

const { requirePrivilege, allowPublic, ROLES, RISK_LEVELS } = require('../middleware/actor.js');

// GET /api/system/config - Public configuration for client initialization
router.get('/config', allowPublic, requirePrivilege({ capability: 'SYSTEM_READ' }), async (req, res) => {
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
router.get('/health', allowPublic, requirePrivilege({ capability: 'AUTH_SYSTEM_STATUS' }), async (req, res) => {
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
router.get('/sync/events', requirePrivilege({ capability: 'SYSTEM_LOGS' }), async (req, res) => {
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
    console.log("REQ HEADERS", req.headers);
    const store = dbContext.getStore();
    console.log("CTX TRACE", store);
    try {
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
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// GET /api/system/bootstrap-genesis
router.get('/bootstrap-genesis', allowPublic, requirePrivilege({ capability: 'ADMIN_ONBOARD_GENESIS' }), async (req, res) => {
    const { wallet } = req.query;
    if (!wallet || !wallet.startsWith('0x')) return res.status(400).json({ error: 'Valid wallet address required' });

    try {
        const check = await pool.query('SELECT id FROM users LIMIT 1');
        if (check.rows.length > 0) return res.status(403).json({ error: 'System already initialized' });

        const result = await pool.query(`
            INSERT INTO users (username, name, email, wallet_address, password_hash, role, kyc_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'admin', true, NOW(), NOW())
            RETURNING id, wallet_address, role
        `, [`genesis_admin_${wallet.slice(0, 6)}`, 'Genesis Admin', `admin@bbsns.online`, wallet.toLowerCase(), 'BOOTSTRAPPED_SIGNATURE_AUTH_ONLY']);

        res.json({ message: 'System successfully bootstrapped.', admin: result.rows[0], next_step: 'Please login via Desktop.' });
    } catch (err) {
        res.status(500).json({ error: 'Bootstrap failed', detail: err.message });
    }
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

module.exports = router;
