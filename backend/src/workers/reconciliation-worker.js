const pool = require("../db/index");
const { ethers } = require("ethers");
const lockService = require("../services/lock.service");
require("dotenv").config();

/**
 * Reconciliation Worker
 * 
 * Goal: Eliminate state drift by settling 'submitted_to_blockchain' transactions
 * into 'confirmed' (chain_confirmed = true) or 'failed' states.
 */
async function reconcile() {
    const lockId = 1001; // RECONCILIATION
    if (!(await lockService.tryLock(lockId))) {
        console.log("🔄 [RECONCILIATION] Skip: Another instance is reconcilling.");
        return;
    }

    try {
        const { provider, contract } = await require("../blockchain/connection").connectBNB();

        // --- PHASE 1: Reconcile Notarization Actions (Hardened) ---
        const docResult = await pool.query(`
            SELECT id, idempotency_key, tx_hash, tx_status, submission_state, processing_started_at, storage_key, filepath 
            FROM documents 
            WHERE (tx_status IN ('initiated', 'pending') OR submission_state = 'submitted_to_blockchain')
            AND chain_confirmed = false
            AND is_deleted = false
        `);

        console.log(`🔎 Found ${docResult.rows.length} documents requiring hardened reconciliation.`);
        for (const doc of docResult.rows) {
            try {
                const docHash = doc.idempotency_key || doc.file_hash;
                if (!docHash) continue;
                const docHashBytes = docHash.startsWith('0x') ? docHash : `0x${docHash}`;

                // 1. BLIND ON-CHAIN VERIFICATION (Universal Safety)
                console.log(`⏳ Blind-checking on-chain state for Doc ${doc.id} (${docHashBytes})...`);
                const onChainData = await contract.getDocument(docHashBytes);
                
                if (onChainData.exists && Number(onChainData.status) > 0) {
                    console.log(`   ✅ Confirmed via On-Chain State: Doc ${doc.id}`);
                    await pool.query(
                        "UPDATE documents SET chain_confirmed = true, storage_state = 'NOTARIZED', tx_status = 'confirmed', updated_at = NOW() WHERE id = $1",
                        [doc.id]
                    );
                    // Trigger storage cleanup
                    await cleanupStorage(doc);
                    continue;
                }

                // 2. RECEIPT-BASED RECONCILIATION
                if (doc.tx_hash || doc.approval_tx_hash) {
                    const hash = doc.tx_hash || doc.approval_tx_hash;
                    console.log(`   ⏳ Checking receipt for hash: ${hash}`);
                    const receipt = await provider.getTransactionReceipt(hash);

                    if (receipt) {
                        if (receipt.status === 1) {
                            console.log(`   ✅ Transaction Confirmed: ${hash}`);
                            await pool.query(
                                "UPDATE documents SET chain_confirmed = true, storage_state = 'NOTARIZED', tx_status = 'confirmed', updated_at = NOW() WHERE id = $1",
                                [doc.id]
                            );
                            await cleanupStorage(doc);
                        } else {
                            console.error(`   ❌ Transaction Reverted: ${hash}`);
                            await pool.query(
                                "UPDATE documents SET tx_status = 'failed', updated_at = NOW() WHERE id = $1",
                                [doc.id]
                            );
                        }
                        continue;
                    }
                }

                // 3. STALE TASK RECOVERY
                const isStale = doc.processing_started_at && (new Date() - new Date(doc.processing_started_at)) > 15 * 60 * 1000;
                if (isStale && (!doc.tx_hash && !doc.approval_tx_hash)) {
                    console.warn(`   ⚠️ Stale 'initiated' task with no tx_hash found for Doc ${doc.id}. Resetting to failed.`);
                    await pool.query(
                        "UPDATE documents SET tx_status = 'failed', updated_at = NOW() WHERE id = $1",
                        [doc.id]
                    );
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

        const identityABI = ["function getUserRole(address) view returns (uint8)"];
        const identityRegistry = new ethers.Contract(process.env.NOTARY_REGISTRY_ADDRESS, identityABI, provider);

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
            await storageService.deleteFile(doc.storage_key);
            deleteSuccess = true;
        } catch (s3Err) {
            console.error(`   ⚠️ S3 Cleanup Failed for Document ${doc.id}: ${s3Err.message}`);
        }
    } else if (doc.filepath) {
        try {
            const fs = require('fs');
            const path = require('path');
            let absPath = doc.filepath;
            if (!path.isAbsolute(absPath)) absPath = path.join(__dirname, '../../', absPath);
            if (fs.existsSync(absPath)) {
                fs.unlinkSync(absPath);
                console.log(`   🗑️ Local file deleted for Document ${doc.id}`);
            }
            deleteSuccess = true;
        } catch (fsErr) {
            console.error(`   ⚠️ Local Cleanup Failed for Document ${doc.id}: ${fsErr.message}`);
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
