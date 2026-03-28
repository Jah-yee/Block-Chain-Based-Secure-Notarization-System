const pool = require("../db/index");
const { ethers } = require("ethers");
const lockService = require("../services/lock.service");
const ConfigService = require("../services/config.service");
const { Logger, SIGNALS, ERROR_TYPES, ERROR_STAGES } = require("../services/logger.service");
const logger = new Logger('RECONCILIATION_WORKER');
require("dotenv").config();

let cyclesSinceLastSummary = 0;
const SUMMARY_INTERVAL_CYCLES = 10;

/**
 * Reconciliation Worker
 * 
 * Goal: Eliminate state drift by settling 'submitted_to_blockchain' transactions
 * into 'confirmed' (chain_confirmed = true) or 'failed' states.
 */
async function reconcile() {
    if (process.env.STOP_WORKERS === 'true') {
        logger.warn('WORKER_PAUSED', { message: 'Worker is paused via STOP_WORKERS env var.' });
        return;
    }

    const lockId = 1001; // RECONCILIATION
    if (!(await lockService.tryLock(lockId))) {
        console.log("🔄 [RECONCILIATION] Skip: Another instance is reconcilling.");
        return;
    }

    const startTime = Date.now();
    try {
        const { provider, contract } = await require("../blockchain/connection").connectBNB();

        // --- PHASE 0: Backlog Metrics (Observability) ---
        const backlogRes = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE tx_status = 'initiated') as pending_count,
                COUNT(*) FILTER (WHERE tx_status = 'pending') as processing_count,
                COUNT(*) FILTER (WHERE tx_status = 'failed') as failed_count
            FROM documents 
            WHERE chain_confirmed = false AND is_deleted = false
        `);
        const metrics = backlogRes.rows[0];
        logger.heartbeat(metrics);

        // --- PHASE 0.1: Periodic System Health Summary (Phase 7) ---
        cyclesSinceLastSummary++;
        if (cyclesSinceLastSummary >= SUMMARY_INTERVAL_CYCLES) {
            const healthRes = await pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE retry_count > 5) as high_retry_count,
                    COUNT(*) FILTER (WHERE tx_status = 'initiated' AND (NOW() - processing_started_at) > interval '30 minutes') as stuck_count
                FROM documents 
                WHERE chain_confirmed = false
            `);
            logger.info('SYSTEM_HEALTH_SUMMARY', { 
                ...metrics, 
                ...healthRes.rows[0],
                worker_uptime_ms: process.uptime() * 1000 
            });
            cyclesSinceLastSummary = 0;
        }

        // --- PHASE 1: Reconcile Notarization Actions (Hardened) ---
        const docResult = await pool.query(`
            SELECT id, idempotency_key, tx_hash, tx_status, submission_state, processing_started_at, storage_key, correlation_id
            FROM documents 
            WHERE (tx_status IN ('initiated', 'pending') OR submission_state = 'submitted_to_blockchain')
            AND chain_confirmed = false
            AND is_deleted = false
        `);

        logger.info('RECONCILIATION_CYCLE_STARTED', { count: docResult.rows.length });
        for (const doc of docResult.rows) {
            try {
                const docHash = doc.idempotency_key || doc.file_hash;
                if (!docHash) continue;
                const docHashBytes = docHash.startsWith('0x') ? docHash : `0x${docHash}`;

                // 1. BLIND ON-CHAIN VERIFICATION (Universal Safety)
                const blindCheckStart = Date.now();
                const onChainData = await contract.getDocument(docHashBytes);
                const blindCheckDuration = Date.now() - blindCheckStart;
                
                if (onChainData.exists && Number(onChainData.status) > 0) {
                    logger.signal('RECOVERY_TRIGGERED', { 
                        id: doc.id, 
                        correlation_id: doc.correlation_id,
                        reason: 'Blind on-chain check matched',
                        duration_ms: blindCheckDuration
                    });
                    await pool.query(
                        "UPDATE documents SET chain_confirmed = true, storage_state = 'NOTARIZED', tx_status = 'confirmed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
                        [doc.id]
                    );
                    logger.info('TX_CONFIRMED', {
                        id: doc.id,
                        correlation_id: doc.correlation_id,
                        previous_state: doc.tx_status,
                        new_state: 'confirmed',
                        duration_ms: blindCheckDuration
                    });
                    // Trigger storage cleanup
                    await cleanupStorage(doc);
                    continue;
                }

                // 2. RECEIPT-BASED RECONCILIATION
                if (doc.tx_hash) {
                    const receiptCheckStart = Date.now();
                    const receipt = await provider.getTransactionReceipt(doc.tx_hash);
                    const receiptCheckDuration = Date.now() - receiptCheckStart;

                    if (receipt) {
                        if (receipt.status === 1) {
                            await pool.query(
                                "UPDATE documents SET chain_confirmed = true, storage_state = 'NOTARIZED', tx_status = 'confirmed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
                                [doc.id]
                            );
                            logger.info('TX_CONFIRMED', {
                                id: doc.id,
                                correlation_id: doc.correlation_id,
                                tx_hash: doc.tx_hash,
                                previous_state: doc.tx_status,
                                new_state: 'confirmed',
                                duration_ms: receiptCheckDuration
                            });
                            await cleanupStorage(doc);
                        } else {
                            logger.error('TX_FAILED', {
                                id: doc.id,
                                correlation_id: doc.correlation_id,
                                error_type: ERROR_TYPES.CONTRACT,
                                error_stage: ERROR_STAGES.CONFIRMATION,
                                previous_state: doc.tx_status,
                                new_state: 'failed',
                                duration_ms: receiptCheckDuration
                            }, new Error("Transaction reverted on-chain"));
                            await pool.query(
                                "UPDATE documents SET tx_status = 'failed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
                                [doc.id]
                            );
                        }
                        continue;
                    }
                }

                // 3. STALE TASK RECOVERY
                const isStale = doc.processing_started_at && (new Date() - new Date(doc.processing_started_at)) > 15 * 60 * 1000;
                if (isStale) {
                    logger.signal('TASK_STUCK', { 
                        id: doc.id, 
                        correlation_id: doc.correlation_id, 
                        state: doc.tx_status,
                        started_at: doc.processing_started_at
                    });
                    if (!doc.tx_hash) {
                        await pool.query(
                            "UPDATE documents SET tx_status = 'failed', last_error = $1, updated_at = NOW(), status_updated_at = NOW() WHERE id = $2",
                            [JSON.stringify({ type: ERROR_TYPES.RPC, stage: ERROR_STAGES.RECOVERY, message: 'Task stuck in initiated state with no TX' }), doc.id]
                        );
                    }
                }

            } catch (innerErr) {
                console.error(`   ⚠️ Error reconciling Document ${doc.id}:`, innerErr.message);
            }
        }

        // --- PHASE 2: Reconcile User Identity Sync (Hardened) ---
        const userResult = await pool.query(`
            SELECT id, wallet_address, tx_hash, tx_status, identity_state, processing_started_at 
            FROM users 
            WHERE (tx_status IN ('initiated', 'pending') OR identity_state = 'ONCHAIN_PENDING')
        `);

        console.log(`🔎 Found ${userResult.rows.length} users requiring hardened reconciliation.`);

        const config = await ConfigService.getConfig();
        const identityABI = ["function getUserRole(address) view returns (uint8)"];
        const identityRegistry = new ethers.Contract(config.contracts.notaryRegistry, identityABI, provider);

        for (const user of userResult.rows) {
            try {
                // 1. BLIND ON-CHAIN VERIFICATION
                console.log(`⏳ Blind-checking role for User ${user.wallet_address}...`);
                const liveRole = await identityRegistry.getUserRole(user.wallet_address);
                
                if (Number(liveRole) > 0) {
                    console.log(`   ✅ Confirmed via On-Chain State: User ${user.wallet_address}`);
                    await pool.query(
                        "UPDATE users SET identity_state = 'ACTIVE', tx_status = 'confirmed', updated_at = NOW() WHERE id = $1",
                        [user.id]
                    );
                    continue;
                }

                // 2. RECEIPT-BASED RECONCILIATION
                if (user.tx_hash) {
                    console.log(`   ⏳ Checking receipt for hash: ${user.tx_hash}`);
                    const receipt = await provider.getTransactionReceipt(user.tx_hash);
                    if (receipt) {
                        if (receipt.status === 1) {
                            await pool.query(
                                "UPDATE users SET identity_state = 'ACTIVE', tx_status = 'confirmed', updated_at = NOW() WHERE id = $1",
                                [user.id]
                            );
                        } else {
                            await pool.query(
                                "UPDATE users SET tx_status = 'failed', updated_at = NOW() WHERE id = $1",
                                [user.id]
                            );
                        }
                        continue;
                    }
                }

                // 3. STALE TASK RECOVERY
                const isStale = user.processing_started_at && (new Date() - new Date(user.processing_started_at)) > 15 * 60 * 1000;
                if (isStale && !user.tx_hash) {
                    console.warn(`   ⚠️ Stale 'initiated' sync found for User ${user.wallet_address}. Resetting to failed.`);
                    await pool.query(
                        "UPDATE users SET tx_status = 'failed', updated_at = NOW() WHERE id = $1",
                        [user.id]
                    );
                }
            } catch (userErr) {
                console.error(`   ⚠️ Error reconciling User ${user.id}:`, userErr.message);
            }
        }

        // --- PHASE 3: Reconcile NTKR Transactions ---
    } catch (err) {
        console.error("❌ Reconciliation Worker Error:", err.message);
    } finally {
        await lockService.unlock(1001);
    }
}

// Run every 30 seconds if called directly
if (require.main === module) {
    const INTERVAL = process.env.RECONCILIATION_INTERVAL || 30000;
    console.log(`🚀 Reconciliation Worker active. Polling interval: ${INTERVAL}ms`);

    reconcile();
    setInterval(reconcile, INTERVAL);
}


/**
 * Helper: Cleanup storage after confirmed notarization
 */
async function cleanupStorage(doc) {
    let deleteSuccess = false;
    if (doc.storage_key) {
        try {
            const storageService = require('../services/storage.service');
            // Try cloud delete first
            await storageService.deleteFile(doc.storage_key);
            deleteSuccess = true;
        } catch (s3Err) {
            // If cloud delete fails, try local unlink (hybrid support)
            try {
                const fs = require('fs');
                const path = require('path');
                let absPath = doc.storage_key;
                if (!path.isAbsolute(absPath)) absPath = path.join(__dirname, '../../', absPath);
                if (fs.existsSync(absPath)) {
                    fs.unlinkSync(absPath);
                    console.log(`   🗑️ Local file deleted for Document ${doc.id}`);
                    deleteSuccess = true;
                }
            } catch (fsErr) {
                console.error(`   ⚠️ Local Cleanup Failed for Document ${doc.id}: ${fsErr.message}`);
            }
        }
    }

    if (deleteSuccess) {
        await pool.query(
            "UPDATE documents SET storage_state = 'DELETED', updated_at = NOW() WHERE id = $1",
            [doc.id]
        );
        console.log(`   🔐 Document ${doc.id} moved to DELETED storage state.`);
    }
}

module.exports = { reconcile };
