const express = require('express');
const router = express.Router();
const pool = require('../db');
const ConfigService = require('../services/config.service');

const { requirePrivilege, allowPublic, ROLES, RISK_LEVELS } = require('../../middleware/actor.js');

// GET /api/system/config - Public configuration for client initialization
router.get('/config', allowPublic, async (req, res) => {
    try {
        const config = await ConfigService.getConfig();
        res.json({
            config_version: ConfigService.currentVersion,
            ...config
        });
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
 * Restricted to verified ADMINs with live on-chain role check.
 */
router.post('/config', requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
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
router.post('/config/rollback', requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.HIGH }), async (req, res) => {
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
router.get('/health', allowPublic, async (req, res) => {
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
        // 1. Database Check
        await pool.query('SELECT 1');
        health.checks.database = 'OK';

        // 2. RPC Check
        const { ethers } = require('ethers');
        const config = await ConfigService.getConfig();
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const network = await provider.getNetwork();
        
        if (Number(network.chainId) === Number(config.chainId)) {
            health.checks.rpc = 'OK';
        } else {
            health.checks.rpc = `MISMATCH (Expected ${config.chainId}, got ${network.chainId})`;
            health.status = 'DEGRADED';
        }

        // 3. Contract Check (Verify bytecode exists at critical address)
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

// GET /api/system/logs - Fetch REAL system logs (Admin only)
router.get('/logs', requirePrivilege({ minRole: ROLES.ADMIN, risk: RISK_LEVELS.LOW }), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, level, message, source, metadata, created_at as timestamp 
            FROM system_logs 
            ORDER BY created_at DESC 
            LIMIT 50
        `);

        // Map backend fields to frontend LogEntry interface
        const logs = result.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            // Map 'source' to 'actor' if 'actor' is missing
            actor: row.source || 'system',
            // Default to 'SYSTEM_EVENT' if action is missing in metadata or not provided
            action: (row.metadata && row.metadata.action) ? row.metadata.action : 'SYSTEM_EVENT',
            // Map 'level' to 'status' (Frontend expects SUCCESS/FAILED, fallback logic)
            status: row.level === 'error' ? 'FAILED' : 'SUCCESS',
            details: row.message,
            tx_hash: (row.metadata && row.metadata.tx_hash) ? row.metadata.tx_hash : null
        }));

        res.json(logs);
    } catch (err) {
        console.error('Failed to fetch system logs:', err);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
