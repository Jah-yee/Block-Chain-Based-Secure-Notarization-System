const pool = require("../db/index");
const { ethers } = require("ethers");
const lockService = require("../services/lock.service");
const ConfigService = require("../services/config.service");
const SyncLogger = require("../services/SyncLogger");
const { Logger, SIGNALS, ERROR_TYPES, ERROR_STAGES } = require("../services/logger.service");
const logger = new Logger('RECONCILIATION_WORKER');
require("dotenv").config();

let cyclesSinceLastSummary = 0;
const SUMMARY_INTERVAL_CYCLES = 10;

/**
 * Reconciliation Worker: The Authoritative Judge
 * Responsibility: Final settlement for all blockchain-bound tasks.
 */
const { runWithSystemContext } = require('../middleware/actor');
const WorkerRegistry = require('../services/worker-registry.service');

async function reconcile() {
    if (process.env.STOP_WORKERS === 'true') {
        logger.warn('WORKER_PAUSED', { message: 'Worker is paused via STOP_WORKERS env var.' });
        return;
    }

    const lockId = 1001; 
    if (!(await lockService.tryLock(lockId))) {
        return;
    }

    // 🛡️ [PHASE 6.2] Wrap reconciliation cycle in System Audit Context
    await runWithSystemContext('RECONCILIATION_WORKER', 'Settling blockchain transactions and cleaning storage', async () => {
        try {
            WorkerRegistry.heartbeat('reconciliation', 'OK');
            const { provider, contract } = await require("../blockchain/connection").connectBNB();
            const config = await ConfigService.getConfig();
            const identityABI = ["function getUserRole(address) view returns (uint8)"];
            const identityRegistry = new ethers.Contract(config.contracts.notaryRegistry, identityABI, provider);

            // --- PHASE 1: Notarization Reconciliation ---
            const docResult = await pool.query(`
                SELECT id, idempotency_key, tx_hash, tx_status, submission_state, processing_started_at, storage_key, correlation_id
                FROM documents 
                WHERE (tx_status IN ('initiated', 'pending') OR submission_state = 'submitted_to_blockchain')
                  AND chain_confirmed = false AND is_deleted = false
            `);

            for (const doc of docResult.rows) {
                try {
                    const docHash = doc.idempotency_key;
                    if (!docHash) continue;
                    const docHashBytes = docHash.startsWith('0x') ? docHash : `0x${docHash}`;

                    // 1. BLIND ON-CHAIN CHECK (Self-Heal)
                    const onChainData = await contract.getDocument(docHashBytes);
                    if (onChainData.exists && Number(onChainData.status) > 0) {
                        await pool.query(
                            "UPDATE documents SET chain_confirmed = true, tx_status = 'confirmed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
                            [doc.id]
                        );
                        await SyncLogger.logEvent({
                            userId: doc.id, syncType: 'notarization', eventType: SyncLogger.EVENTS.SELF_HEAL_SUCCESS,
                            statusBefore: doc.tx_status, statusAfter: 'confirmed', metadata: { reason: 'onchain_match' }
                        });
                        await cleanupStorage(doc);
                        continue;
                    }

                    // 2. RECEIPT CHECK
                    if (doc.tx_hash) {
                        const receipt = await provider.getTransactionReceipt(doc.tx_hash);
                        if (receipt) {
                            const isSuccess = receipt.status === 1;
                            const statusAfter = isSuccess ? 'confirmed' : 'failed';
                            await pool.query(
                                "UPDATE documents SET chain_confirmed = $1, tx_status = $2, updated_at = NOW(), status_updated_at = NOW() WHERE id = $3",
                                [isSuccess, statusAfter, doc.id]
                            );
                            await SyncLogger.logEvent({
                                userId: doc.id, syncType: 'notarization', 
                                eventType: isSuccess ? SyncLogger.EVENTS.TX_CONFIRMED : SyncLogger.EVENTS.TX_FAILED,
                                statusBefore: doc.tx_status, statusAfter, txHash: doc.tx_hash
                            });
                            if (isSuccess) await cleanupStorage(doc);
                            continue;
                        }
                    }
                } catch (innerErr) {
                    console.error(`[RECON] Notarization error for ${doc.id}:`, innerErr.message);
                }
            }

            // --- PHASE 2: Identity Sync Reconciliation ---
            const userResult = await pool.query(`
                SELECT id, wallet_address, tx_hash, tx_status, retry_count, manual_retry_count
                FROM users 
                WHERE tx_status IN ('processing', 'initiated', 'pending', 'retrying')
                  AND (tx_status IS NULL OR tx_status != 'confirmed')
            `);

            for (const user of userResult.rows) {
                try {
                    // 1. BLIND ON-CHAIN CHECK
                    const liveRole = await identityRegistry.getUserRole(user.wallet_address);
                    if (Number(liveRole) > 0) {
                        await pool.query(
                            "UPDATE users SET tx_status = 'confirmed', updated_at = NOW(), status_updated_at = NOW() WHERE id = $1",
                            [user.id]
                        );
                        await SyncLogger.logEvent({
                            userId: user.id, syncType: 'identity', eventType: SyncLogger.EVENTS.SELF_HEAL_SUCCESS,
                            statusBefore: user.tx_status, statusAfter: 'confirmed', metadata: { reason: 'already_registered' }
                        });
                        continue;
                    }

                    // 2. RECEIPT CHECK
                    if (user.tx_hash) {
                        const receipt = await provider.getTransactionReceipt(user.tx_hash);
                        if (receipt) {
                            const isSuccess = receipt.status === 1;
                            const statusAfter = isSuccess ? 'confirmed' : 'failed';
                            await pool.query(
                                "UPDATE users SET tx_status = $1, updated_at = NOW(), status_updated_at = NOW() WHERE id = $2",
                                [statusAfter, user.id]
                            );
                            await SyncLogger.logEvent({
                                userId: user.id, syncType: 'identity', 
                                eventType: isSuccess ? SyncLogger.EVENTS.TX_CONFIRMED : SyncLogger.EVENTS.TX_FAILED,
                                statusBefore: user.tx_status, statusAfter, txHash: user.tx_hash
                            });
                        }
                    }
                } catch (userErr) {
                    console.error(`[RECON] Identity error for ${user.id}:`, userErr.message);
                }
            }

            // --- PHASE 3: Role Promotion Reconciliation ---
            const roleResult = await pool.query(`
                SELECT id, wallet_address, role_tx_hash, role_tx_status, role_retry_count, role_manual_retry_count
                FROM users 
                WHERE role_tx_status IN ('processing', 'initiated', 'pending', 'retrying')
                  AND (role_tx_status IS NULL OR role_tx_status != 'confirmed')
            `);

            for (const user of roleResult.rows) {
                try {
                    // 1. BLIND ON-CHAIN CHECK
                    const liveRole = await identityRegistry.getUserRole(user.wallet_address);
                    if (Number(liveRole) >= 2) {
                        await pool.query(
                            "UPDATE users SET role_tx_status = 'confirmed', updated_at = NOW(), role_status_updated_at = NOW() WHERE id = $1",
                            [user.id]
                        );
                        await SyncLogger.logEvent({
                            userId: user.id, syncType: 'role', eventType: SyncLogger.EVENTS.SELF_HEAL_SUCCESS,
                            statusBefore: user.role_tx_status, statusAfter: 'confirmed', metadata: { reason: 'already_notary' }
                        });
                        continue;
                    }

                    // 2. RECEIPT CHECK
                    if (user.role_tx_hash) {
                        const receipt = await provider.getTransactionReceipt(user.role_tx_hash);
                        if (receipt) {
                            const isSuccess = receipt.status === 1;
                            const statusAfter = isSuccess ? 'confirmed' : 'failed';
                            await pool.query(
                                "UPDATE users SET role_tx_status = $1, updated_at = NOW(), role_status_updated_at = NOW() WHERE id = $2",
                                [statusAfter, user.id]
                            );
                            await SyncLogger.logEvent({
                                userId: user.id, syncType: 'role', 
                                eventType: isSuccess ? SyncLogger.EVENTS.TX_CONFIRMED : SyncLogger.EVENTS.TX_FAILED,
                                statusBefore: user.role_tx_status, statusAfter, txHash: user.role_tx_hash
                            });
                        }
                    }
                } catch (roleErr) {
                    console.error(`[RECON] Role error for ${user.id}:`, roleErr.message);
                }
            }

        } catch (err) {
            console.error("❌ Reconciliation Master Error:", err.message);
            WorkerRegistry.heartbeat('reconciliation', 'FAIL', { error: err.message });
        }
    });

    await lockService.unlock(lockId);
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
