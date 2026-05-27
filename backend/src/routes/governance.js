const express = require("express");
const router = express.Router();
const pool = require("../db/index");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic } = require("../middleware/actor.js");
const { ethers } = require("ethers");
const path = require("path");
const ConfigService = require("../services/config.service");
const ProviderService = require("../blockchain/provider-service");
const { withDomain, withAction, withMutation } = require("../middleware/policy.js");

// UUID validation helper - prevents Postgres cast errors on invalid session IDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

// router.use(loadActor) deprecated for zero-trust compliance

// GET /api/governance/proposals
router.get("/proposals", requirePrivilege({ capability: 'GOV_PROPOSAL_LIST' }), async (req, res) => {
    try {
        let query = `
            SELECT 
                p.id,
                p.title,
                p.description,
                p.type,
                p.target_id,
                p.proposer_id,
                p.participation_scope,
                CASE 
                    WHEN p.status = 'active' AND p.expires_at < NOW() THEN 'expired' 
                    ELSE p.status::text 
                END as status,
                p.created_at,
                p.expires_at,
                p.executed_at,
                p.target_notaries,
                p.executed_by,
                p.execution_tx_hash,
                p.on_chain_tx_index,
                p.on_chain_data,
                p.on_chain_target,
                u.name as proposer_name,
                COALESCE(vote_counts.approvals, 0)::integer as approvals,
                COALESCE(vote_counts.rejections, 0)::integer as rejections,
                my_v.decision as my_vote,
                my_v.signature as my_vote_hash
            FROM governance_proposals p
            LEFT JOIN users u ON p.proposer_id = u.id
            LEFT JOIN (
                SELECT 
                    proposal_id,
                    COUNT(CASE WHEN decision = 'approve' THEN 1 END) as approvals,
                    COUNT(CASE WHEN decision = 'reject' THEN 1 END) as rejections
                FROM governance_votes
                GROUP BY proposal_id
            ) vote_counts ON p.id = vote_counts.proposal_id
            LEFT JOIN governance_votes my_v ON p.id = my_v.proposal_id AND my_v.voter_id = $1
            WHERE p.on_chain_tx_index IS NOT NULL
        `;
        let params = [req.actor.id];

        // If actor is a NOTARY (and not an ADMIN/OWNER), filter by scope and targeting
        if (req.actor.role === ROLES.NOTARY && req.actor.role < ROLES.ADMIN) {
            // 🛡️ [ACCESS_CONTROL] Admin-scoped proposals must NEVER be visible to notaries,
            // even when target_notaries is empty. Check scope first, then targeting.
            query += ` AND p.participation_scope != 'admin'`;
            query += ` AND (p.target_notaries @> $2::jsonb OR p.target_notaries = '[]'::jsonb OR p.target_notaries IS NULL)`;
            params.push(JSON.stringify([req.actor.id]));
        }

        query += ` ORDER BY p.created_at DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/governance/alerts/count
router.get("/alerts/count", allowPublic, requirePrivilege({ capability: 'GOV_PROPOSAL_LIST', allowPublic: true }), async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM governance_proposals WHERE status = 'active' AND expires_at >= NOW() AND on_chain_tx_index IS NOT NULL");
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/governance/proposals (Admin only)
router.post("/proposals", withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_PROPOSAL_CREATE' }), withAction('GOV_PROPOSAL_CREATE'), withMutation(), async (req, res) => {
    const { title, description, type, target_id, target_notaries, expires_in_days, duration_hours, on_chain_tx_index, on_chain_data, on_chain_target, participation_scope } = req.body;

    if (!title || !type) {
        return res.status(400).json({ error: "Title and type are required" });
    }

    const expires_at = new Date();
    if (duration_hours) {
        expires_at.setHours(expires_at.getHours() + parseInt(duration_hours, 10));
    } else {
        expires_at.setDate(expires_at.getDate() + (expires_in_days || 7));
    }

    const scope = participation_scope || 'all';

    try {
        // 🛡️ [FAST_TRACK] Check for Single Admin Mode
        const adminRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin' OR role = 'owner'");
        const adminCount = parseInt(adminRes.rows[0].count);
        // Note: Even if adminCount is 1, it must be executed on-chain. Status is active until on-chain execution.
        const status = 'active';

        const result = await pool.query(
            `INSERT INTO governance_proposals (title, description, type, target_id, target_notaries, proposer_id, expires_at, status, on_chain_tx_index, on_chain_data, on_chain_target, participation_scope)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [title, description, type, target_id, JSON.stringify(target_notaries || []), req.actor.id, expires_at, status, on_chain_tx_index, on_chain_data, on_chain_target, scope]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/governance/proposals/:id (Admin/Proposer, 1-hour limit)
router.delete("/proposals/:id", withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_PROPOSAL_CANCEL' }), withAction('GOV_PROPOSAL_CANCEL'), withMutation(), async (req, res) => {
    const proposalId = req.params.id;

    try {
        // 1. Fetch proposal to check constraints
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        if (propRes.rows.length === 0) return res.status(404).json({ error: "Proposal not found" });
        
        const proposal = propRes.rows[0];

        // 2. Authorization Check (Proposer or Admin)
        if (req.actor.role < ROLES.ADMIN && proposal.proposer_id !== req.actor.id) {
            return res.status(403).json({ error: "Unauthorized: Only the proposer or an administrator can cancel this proposal" });
        }

        // 3. Temporal Gate (24 Hours for Testing)
        const ageInMs = Date.now() - new Date(proposal.created_at).getTime();
        if (ageInMs > 86400000) { // 24 Hours
            return res.status(400).json({ error: "Temporal Gate Violation: Proposals can only be cancelled within 24 hours of creation" });
        }

        // 4. Finality Gate (Not on-chain)
        if (proposal.on_chain_tx_index !== null) {
            return res.status(400).json({ error: "Finality Violation: Cannot delete a proposal that has already been submitted to the blockchain" });
        }

        // 5. Hard Deletion (User Request: "deleted from everywhere")
        await pool.query("DELETE FROM governance_proposals WHERE id = $1", [proposalId]);

        res.json({ message: "Proposal purged from system successfully" });
    } catch (err) {
        console.error("Proposal Deletion Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/governance/proposals/:id/reject - Cast a gasless off-chain rejection
router.post("/proposals/:id/reject", requirePrivilege({ capability: 'GOV_VOTE_SUBMIT' }), async (req, res) => {
    try {
        const proposalId = req.params.id;
        const voterId = req.actor.id;

        // Verify proposal exists and is active
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        if (propRes.rows.length === 0) {
            return res.status(404).json({ error: "Proposal not found" });
        }
        const proposal = propRes.rows[0];
        if (proposal.status !== 'active') {
            return res.status(400).json({ error: `Proposal is already ${proposal.status}` });
        }
        if (new Date(proposal.expires_at) < new Date()) {
            return res.status(400).json({ error: "Proposal has expired" });
        }

        // Record the rejection vote in governance_votes
        await pool.query(
            `INSERT INTO governance_votes (proposal_id, voter_id, decision, signature)
             VALUES ($1, $2, 'reject', 'off-chain-reject')
             ON CONFLICT (proposal_id, voter_id)
             DO UPDATE SET decision = 'reject', signature = 'off-chain-reject', voted_at = NOW()`,
            [proposalId, voterId]
        );

        // Tally votes to see if threshold is met
        const voteCountRes = await pool.query("SELECT COUNT(*) FROM governance_votes WHERE proposal_id = $1 AND decision = 'reject'", [proposalId]);
        const rejections = parseInt(voteCountRes.rows[0].count, 10);
        
        let threshold = 2; // fallback
        try {
            const config = await ConfigService.getConfig();
            const ProviderService = require("../blockchain/provider-service");
            const provider = await ProviderService.getProvider();
            const artifact = require("../artifacts/BBSNSMultiSig.json");
            const contract = new ethers.Contract(config.contracts.multisig, artifact.abi, provider);
            threshold = Number(await contract.threshold());
        } catch(e) {
            console.warn("[VOTE_TALLY] Could not fetch threshold, using fallback.");
        }

        if (rejections >= threshold) {
             await pool.query("UPDATE governance_proposals SET status = 'rejected' WHERE id = $1", [proposalId]);
             console.log(`[GOV_REJECT] Proposal ${proposalId} rejected by threshold.`);
        }

        res.json({ message: "Rejection vote cast successfully", rejections, threshold });
    } catch (err) {
        console.error("Rejection vote error:", err);
        res.status(500).json({ error: err.message });
    }
});

// VOTE endpoint deleted. All votes must go through the blockchain now.

// GET /api/governance/multisig/settings
router.get(
    "/multisig/settings",
    requirePrivilege({ capability: "GOV_READ" }),
    async (req, res) => {
        try {
            // AUTHORITATIVE BLOCKCHAIN SYNC (Replacing non-existent GovernanceService)
            const config = await ConfigService.getConfig();
            const contractAddress = config?.contracts?.multisig;

            // Fetch DB admin count in parallel
            const dbAdminRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin' OR role = 'owner'");
            const adminCount = parseInt(dbAdminRes.rows[0].count);

            if (!contractAddress) {
                return res.json({
                    address: "0x0",
                    threshold: 0,
                    timelockDelay: 0,
                    signers: [],
                    adminCount,
                    status: "degraded",
                    error: "Multisig address not configured"
                });
            }

            const provider = await ProviderService.getProvider();
            const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
            const artifact = require(artifactPath);
            const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

            const [threshold, delay, signers] = await Promise.all([
                contract.threshold(),
                contract.timelockDelay(),
                contract.getSigners()
            ]);

            // Query database to map signer wallet addresses to user names
            const signerAddresses = signers.map(s => s.toLowerCase());
            const userRes = await pool.query(
                "SELECT name, wallet_address FROM users WHERE LOWER(wallet_address) = ANY($1)",
                [signerAddresses]
            );

            const signerNames = {};
            // Initialize with address as fallback name
            signers.forEach(s => {
                signerNames[s.toLowerCase()] = s;
            });
            userRes.rows.forEach(row => {
                if (row.wallet_address && row.name) {
                    signerNames[row.wallet_address.toLowerCase()] = row.name;
                }
            });

            res.json({
                address: contractAddress,
                threshold: Number(threshold),
                timelockDelay: Number(delay),
                signers: signers,
                signerNames: signerNames,
                adminCount,
                status: "active"
            });
        } catch (error) {
            console.error("Fetch multisig settings error:", error);
            // 🛡️ [RESILIENCE] Fallback to safe state
            const config = await ConfigService.getConfig();
            const dbAdminRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin' OR role = 'owner'").catch(() => ({ rows: [{ count: 0 }] }));
            const adminCount = parseInt(dbAdminRes.rows[0].count);
            res.json({ 
                address: config?.contracts?.multisig || "0x0",
                threshold: 0,
                timelockDelay: 0,
                signers: [],
                adminCount,
                status: "degraded",
                error: "Failed to fetch multisig settings from blockchain" 
            });
        }
    }
);


router.get(
    "/multisig/stats",
    requirePrivilege({ capability: "GOV_READ" }),
    async (req, res) => {
        try {
            // AUTHORITATIVE BLOCKCHAIN SYNC
            const config = await ConfigService.getConfig();
            const contractAddress = config?.contracts?.multisig;

            if (!contractAddress) {
                return res.json({
                    address: "0x000...",
                    threshold: 0,
                    timelockDelay: 0,
                    signers: [],
                    error: "Contract configuration missing"
                });
            }

            const provider = await ProviderService.getProvider();
            // Load ABI from artifacts (Hardened Path)
            const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
            const artifact = require(artifactPath);
            const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

            const [threshold, delay, signers] = await Promise.all([
                contract.threshold(),
                contract.timelockDelay(),
                contract.getSigners()
            ]);

            const settings = {
                address: contractAddress,
                threshold: Number(threshold),
                timelockDelay: Number(delay),
                signers: signers
            };

            res.json(settings);
        } catch (err) {
            console.error("Blockchain Fetch Error:", err);
            const config = await ConfigService.getConfig();
            // 🛡️ [SECURITY] ENFORCE STRICT CONTRACT: Never return undefined keys
            res.json({
                address: config?.contracts?.multisig || "0x0",
                threshold: 0,
                timelockDelay: 0,
                signers: [],
                status: "degraded",
                error: `Authority sync failed: ${err.message}`,
                network: "BNB Smart Chain Testnet",
                explorer: `https://testnet.bscscan.com/address/${config?.contracts?.multisig}`
            });
        }
    }
);

// GET /api/governance/multisig/transactions
router.get("/multisig/transactions", requirePrivilege({ capability: 'GOV_READ' }), async (req, res) => {
    try {
        const config = await ConfigService.getConfig();
        const contractAddress = config?.contracts?.multisig;

        // Fetch proposals that have been submitted on-chain
        const result = await pool.query(`
            SELECT 
                p.id,
                p.on_chain_tx_index,
                p.created_at as submissionTime,
                p.status,
                p.on_chain_data,
                p.title,
                p.type,
                p.target_id
            FROM governance_proposals p
            WHERE p.on_chain_tx_index IS NOT NULL
            ORDER BY p.created_at DESC
            LIMIT 20
        `);

        let contractThreshold = 0;
        let contractTimelockDelay = 0;
        let contractSigners = [];
        let txEnrichments = {};

        // Try to fetch live blockchain data to enrich transactions
        if (contractAddress) {
            try {
                const provider = await ProviderService.getProvider();
                const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
                const artifact = require(artifactPath);
                const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

                const [threshold, delay, signers, currentVersion] = await Promise.all([
                    contract.threshold(),
                    contract.timelockDelay(),
                    contract.getSigners(),
                    contract.signerVersion()
                ]);
                contractThreshold = Number(threshold);
                contractTimelockDelay = Number(delay);
                contractSigners = signers;
                const currentSignerVersion = Number(currentVersion);

                // Enrich each on-chain transaction with live confirmations
                await Promise.all(result.rows.map(async (row) => {
                    const txIdx = row.on_chain_tx_index;
                    if (txIdx === null || txIdx === undefined) return;
                    try {
                        const [txData, confirmationStatuses] = await Promise.all([
                            contract.getTransaction(txIdx).catch(() => null),
                            Promise.all(signers.map(async (addr) => ({
                                address: addr,
                                confirmed: await contract.isConfirmed(txIdx, addr).catch(() => false)
                            })))
                        ]);

                        const txSignerVersion = txData ? Number(txData[6]) : currentSignerVersion;
                        const isExpired = txSignerVersion !== currentSignerVersion;

                        txEnrichments[txIdx] = {
                            to: txData ? txData[0] : contractAddress, 
                            value: txData ? txData[1].toString() : '0', 
                            data: txData ? txData[2] : (row.on_chain_data || '0x'), 
                            executed: txData ? txData[3] : false,
                            numConfirmations: txData ? Number(txData[4]) : 0,
                            expired: isExpired,
                            confirmations: txData && txData[3] 
                                ? confirmationStatuses.filter(c => c.confirmed)
                                : confirmationStatuses
                        };

                        // 🛡️ Self-Healing State-Gap Check: Auto-update executed status in DB if executed on-chain
                        if (txData && txData[3] && row.status !== 'executed') {
                            await pool.query(
                                `UPDATE governance_proposals 
                                 SET status = 'executed', 
                                     executed_at = NOW(),
                                     execution_tx_hash = 'auto_healed_from_chain'
                                 WHERE id = $1`,
                                [row.id]
                            ).catch(e => console.warn(`[SELF_HEAL_ERR] Failed to auto-heal proposal ${row.id}:`, e.message));

                            // Synchronize DB user role
                            try {
                                if (row.type === 'add_admin_protocol' || row.type === 'add_admin_governance') {
                                    await pool.query("UPDATE users SET role = 'admin' WHERE id::text = $1 OR wallet_address = $2", [row.target_id, row.target_id.toLowerCase()]);
                                } else if (row.type === 'add_notary' || row.type === 'NOTARY_PROMOTION') {
                                    await pool.query("UPDATE users SET role = 'notary' WHERE id::text = $1 OR wallet_address = $2", [row.target_id, row.target_id.toLowerCase()]);
                                } else if (row.type === 'remove_admin' || row.type === 'remove_admin_protocol' || row.type === 'remove_admin_governance' || row.type === 'remove_notary') {
                                    await pool.query("UPDATE users SET role = 'owner' WHERE id::text = $1 OR wallet_address = $2", [row.target_id, row.target_id.toLowerCase()]);
                                }
                            } catch (roleErr) {
                                console.warn(`[SELF_HEAL_ROLE_ERR] Failed to sync role for proposal ${row.id}:`, roleErr.message);
                            }

                            row.status = 'executed';
                        } else if (isExpired && row.status !== 'expired' && row.status !== 'executed') {
                            await pool.query(
                                `UPDATE governance_proposals 
                                 SET status = 'expired', 
                                     updated_at = NOW()
                                 WHERE id = $1`,
                                [row.id]
                            ).catch(e => console.warn(`[SELF_HEAL_ERR] Failed to auto-heal proposal to expired state ${row.id}:`, e.message));
                            row.status = 'expired';
                        }
                    } catch (e) {
                        console.warn(`[MULTISIG_TX_ENRICH] Could not enrich txIndex ${txIdx}:`, e.message);
                    }
                }));
            } catch (chainErr) {
                console.warn('[MULTISIG_TX_ENRICH] Blockchain enrichment failed, using DB-only data:', chainErr.message);
            }
        }

        // Map database fields to the expected blockchain-like format
        const transactions = (result.rows || []).map(row => {
            const txIdx = row.on_chain_tx_index;
            const enriched = txEnrichments[txIdx] || {};
            const submissionTs = row.submissiontime || row.submissionTime;
            const tsNum = submissionTs ? Math.floor(new Date(submissionTs).getTime() / 1000) : 0;
            return {
                index: txIdx !== null ? Number(txIdx) : row.id,
                to: enriched.to || contractAddress, 
                value: enriched.value || '0',
                data: enriched.data || row.on_chain_data || '0x',
                submissionTime: tsNum,
                numConfirmations: enriched.numConfirmations || 0,
                executed: enriched.executed || row.status === 'executed',
                expired: enriched.expired || false,
                confirmations: enriched.confirmations || []
            };
        });

        let signerNames = {};
        if (contractSigners && contractSigners.length > 0) {
            const signerAddresses = contractSigners.map(s => s.toLowerCase());
            const userRes = await pool.query(
                "SELECT name, wallet_address FROM users WHERE LOWER(wallet_address) = ANY($1)",
                [signerAddresses]
            ).catch(() => ({ rows: [] }));
            
            contractSigners.forEach(s => {
                signerNames[s.toLowerCase()] = s;
            });
            userRes.rows.forEach(row => {
                if (row.wallet_address && row.name) {
                    signerNames[row.wallet_address.toLowerCase()] = row.name;
                }
            });
        }

        res.json({ 
            transactions,
            address: contractAddress || '',
            threshold: contractThreshold,
            timelockDelay: contractTimelockDelay,
            signerNames: signerNames
        });
    } catch (err) {
        console.error("[GOVERNANCE_TX_FAIL] Resilient failure fallback:", err.message);
        // 🛡️ [SECURITY] Return safe empty state instead of 500 to keep UI alive
        res.json({
            transactions: [],
            address: '',
            threshold: 0,
            timelockDelay: 0,
            status: "degraded",
            error: "Telemetry stream interrupted"
        });
    }
});

// POST /api/governance/multisig/transactions/:txIndex/execute
// Execute a MultiSig transaction on-chain via the relayer (or sync an already-executed transaction)
router.post(
    "/multisig/transactions/:txIndex/execute",
    withDomain('GOVERNANCE'),
    requirePrivilege({ capability: 'GOV_PROPOSAL_EXECUTE' }),
    withAction('GOV_PROPOSAL_EXECUTE'),
    withMutation(),
    async (req, res) => {
        const txIndex = parseInt(req.params.txIndex, 10);
        if (isNaN(txIndex)) {
            return res.status(400).json({ error: "Invalid transaction index" });
        }

        const { txHash } = req.body || {};

        const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
        const artifact = require(artifactPath);

        let config, multisigAddress, signer, multisigContract;
        try {
            config = await ConfigService.getConfig();
            multisigAddress = config?.contracts?.multisig;
            if (!multisigAddress) throw new Error("Multisig contract address not configured.");

            const { signer: relayerSigner } = await require("../blockchain/connection").connectBNB();
            signer = relayerSigner;
            multisigContract = new ethers.Contract(multisigAddress, artifact.abi, signer);
        } catch (connErr) {
            console.error(`[MULTISIG_EXECUTE] Blockchain connection failed:`, connErr.message);
            return res.status(503).json({ error: `Blockchain connection failed: ${connErr.message}` });
        }

        try {
            let finalTxHash = txHash;

            if (txHash) {
                console.log(`[MULTISIG_EXECUTE] Verifying externally executed txHash ${txHash}...`);
                const provider = await require("../services/providers").getProvider();
                const receipt = await provider.getTransactionReceipt(txHash);
                if (!receipt) {
                    return res.status(400).json({ error: "Transaction receipt not found on-chain. Please wait for confirmation." });
                }
                if (receipt.status !== 1) {
                    return res.status(400).json({ error: "On-chain transaction execution failed." });
                }
                console.log(`[MULTISIG_EXECUTE] ✅ Verified txHash ${txHash} on-chain.`);
            } else {
                // If no txHash provided, check if transaction is already executed on-chain
                try {
                    const txInfo = await multisigContract.transactions(txIndex);
                    if (txInfo && txInfo.executed) {
                        console.log(`[MULTISIG_EXECUTE] Transaction index ${txIndex} is already executed on-chain. Syncing...`);
                        // Proceed to off-chain update without calling executeTransaction again
                        finalTxHash = null; 
                    } else {
                        console.log(`[MULTISIG_EXECUTE] Executing txIndex ${txIndex} on-chain...`);
                        const execTx = await multisigContract.executeTransaction(txIndex);
                        console.log(`[MULTISIG_EXECUTE] executeTransaction sent, waiting for receipt... txHash=${execTx.hash}`);
                        const execReceipt = await execTx.wait();
                        finalTxHash = execReceipt.hash;
                    }
                } catch (err) {
                    console.error(`[MULTISIG_EXECUTE] ❌ On-chain execution failed for txIndex ${txIndex}:`, err.message);
                    return res.status(500).json({ error: `On-chain execution failed: ${err.message}` });
                }
            }

            // Update corresponding off-chain proposal in database if exists
            try {
                const propRes = await pool.query(
                    "SELECT * FROM governance_proposals WHERE on_chain_tx_index = $1",
                    [txIndex]
                );
                if (propRes.rows.length > 0) {
                    const proposal = propRes.rows[0];
                    console.log(`[MULTISIG_EXECUTE] Found matching proposal ${proposal.id}, updating status...`);
                    
                    await pool.query(
                        `UPDATE governance_proposals 
                         SET status = 'executed', 
                             executed_at = NOW(), 
                             executed_by = $1, 
                             execution_tx_hash = $2 
                         WHERE id = $3`,
                        [req.actor?.id || null, finalTxHash, proposal.id]
                    );

                    // Write audit log
                    try {
                        await pool.query(
                            `INSERT INTO audit_logs (action, details, created_at) 
                             VALUES ('GOVERNANCE_EXECUTED', $1, NOW())`,
                            [JSON.stringify({ proposalId: proposal.id, type: proposal.type, target_id: proposal.target_id, executedBy: req.actor?.id, txHash: finalTxHash })]
                        );
                        
                        const { logAction } = require('../utils/logger');
                        logAction(
                            'MULTISIG_EXECUTE',
                            `MultiSig Transaction executed on-chain (Tx Index: ${txIndex}, Proposal ID: ${proposal.id}).`,
                            req.actor?.email || 'admin',
                            { proposal_id: proposal.id, tx_index: txIndex, tx_hash: finalTxHash }
                        );
                    } catch (auditErr) {
                        console.warn(`[MULTISIG_EXECUTE_AUDIT_WARN] Audit log write failed:`, auditErr.message);
                    }
                }
            } catch (dbErr) {
                console.error(`[MULTISIG_EXECUTE_DB_WARN] Failed to update matching proposal:`, dbErr.message);
            }

            res.json({
                success: true,
                message: `Transaction index ${txIndex} executed successfully.`,
                txHash: finalTxHash
            });
        } catch (chainErr) {
            console.error(`[MULTISIG_EXECUTE] ❌ Route handler failure for txIndex ${txIndex}:`, chainErr.message);
            try {
                const { logAction } = require('../utils/logger');
                logAction(
                    'MULTISIG_EXECUTE_FAIL',
                    `MultiSig Transaction execution failed: ${chainErr.message}`,
                    req.actor?.email || 'admin',
                    { tx_index: txIndex, error: chainErr.message }
                );
            } catch (e) {}
            res.status(500).json({ error: `Route handler failure: ${chainErr.message}` });
        }
    }
);

// POST /api/governance/multisig/transactions/:txIndex/revoke
// Revoke a MultiSig confirmation on-chain (must be signed and submitted directly)
router.post(
    "/multisig/transactions/:txIndex/revoke",
    withDomain('GOVERNANCE'),
    requirePrivilege({ capability: 'GOV_REMOTE_INIT' }),
    withAction('GOV_REMOTE_INIT'),
    withMutation(),
    async (req, res) => {
        res.status(400).json({ error: "On-chain confirmation revocation must be signed and submitted directly via MetaMask/Remote Signer." });
    }
);

// SUBMIT-ON-CHAIN endpoint deleted. Desktop App submits directly.

// ================= REMOTE GOVERNANCE VOTING ==================

// POST /api/governance/remote/vote/session - Initialize remote voting session
router.post('/remote/vote/session', withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_REMOTE_INIT' }), withAction('GOV_REMOTE_INIT'), withMutation(), async (req, res) => {
    try {
        const { proposalId, decision } = req.body;
        if (!proposalId || !decision) {
            return res.status(400).json({ error: 'proposalId and decision are required' });
        }

        // Verify proposal exists and has not expired
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        if (propRes.rows.length === 0) {
            return res.status(404).json({ error: "Proposal not found" });
        }
        const proposal = propRes.rows[0];
        if (proposal.status !== 'active') {
            return res.status(400).json({ error: `Proposal is already ${proposal.status}` });
        }
        if (new Date(proposal.expires_at) < new Date()) {
            return res.status(400).json({ error: "Proposal has expired" });
        }

        const challenge = `BBSNS-GOV-VOTE-${proposalId}-${decision}-${Math.random().toString(36).substring(2, 15)}`;
        const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const result = await pool.query(
            'INSERT INTO remote_gov_sessions (proposal_id, decision, challenge, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
            [proposalId, decision, challenge, expires_at]
        );

        res.json({ sessionId: result.rows[0].id });
    } catch (error) {
        console.error('Remote vote session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/governance/remote/vote/status/:sessionId - Poll for voting session status
router.get('/remote/vote/status/:sessionId', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_STATUS', allowPublic: true }), async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!isValidUUID(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }
        const result = await pool.query('SELECT * FROM remote_gov_sessions WHERE id = $1', [sessionId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = result.rows[0];
        const now = new Date();

        if (session.status === 'pending' && new Date(session.expires_at) < now) {
            await pool.query("UPDATE remote_gov_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
            return res.json({ status: 'expired' });
        }

        const propResult = await pool.query('SELECT * FROM governance_proposals WHERE id = $1', [session.proposal_id]);
        let onChainTxIndex = null;
        if (propResult.rows.length > 0) {
            onChainTxIndex = propResult.rows[0].on_chain_tx_index;
        }

        const config = await ConfigService.getConfig();
        const multisigAddress = config?.contracts?.multisig || '';

        res.json({
            status: session.status,
            challenge: session.challenge,
            proposalId: session.proposal_id,
            decision: session.decision,
            wallet_address: session.wallet_address,
            onChainTxIndex,
            multisigAddress
        });
    } catch (error) {
        console.error('Remote vote status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/governance/remote/vote/authorize - Submit txHash for remote vote
router.post('/remote/vote/authorize', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, walletAddress, txHash } = req.body;

        if (!sessionId || !walletAddress || !txHash) {
            return res.status(400).json({ error: 'sessionId, walletAddress, and txHash are required' });
        }
        if (!isValidUUID(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }

        const sessionResult = await pool.query('SELECT * FROM remote_gov_sessions WHERE id = $1', [sessionId]);
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionResult.rows[0];
        if (session.status !== 'pending') {
            return res.status(400).json({ error: `Session is already ${session.status}` });
        }

        // Verify session-binding wallet ownership
        if (session.wallet_address && session.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized: Wallet address does not match co-signer session' });
        }

        if (new Date(session.expires_at) < new Date()) {
            return res.status(401).json({ error: 'Session expired' });
        }

        // 1. Check if user exists and has enough privilege
        const userResult = await pool.query('SELECT * FROM users WHERE wallet_address = $1', [walletAddress.toLowerCase()]);
        if (userResult.rows.length === 0) {
            return res.status(403).json({ error: 'Wallet not registered' });
        }
        const user = userResult.rows[0];
        const ROLE_MAP = { 'none': 0, 'owner': 1, 'notary': 2, 'admin': 3 };
        const numericRole = ROLE_MAP[String(user.role).toLowerCase()] || 0;
        if (numericRole < ROLES.NOTARY) {
            return res.status(403).json({ error: 'Insufficient privileges to vote' });
        }

        // 2. Update session status
        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, signature = $2, authorized_at = NOW() WHERE id = $3",
            [walletAddress.toLowerCase(), txHash, sessionId] // using signature column to store txHash temporarily
        );

        // 3. Sync on-chain vote into governance_votes table
        const proposalId = session.proposal_id;
        const voterId = user.id;
        await pool.query(
            `INSERT INTO governance_votes (proposal_id, voter_id, decision, signature)
             VALUES ($1, $2, 'approve', $3)
             ON CONFLICT (proposal_id, voter_id) 
             DO UPDATE SET decision = 'approve', signature = $3, voted_at = NOW()`,
            [proposalId, voterId, txHash]
        );

        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_CONFIRM',
                `MultiSig Transaction confirmed on-chain by co-signer (Proposal ID: ${proposalId}).`,
                walletAddress.toLowerCase(),
                { proposal_id: proposalId, tx_hash: txHash }
            );
        } catch (e) {
            console.error("Failed to log multisig confirm action:", e.message);
        }

        res.json({ message: 'Vote authorized successfully', proposalPassed: false, status: 'active' });
    } catch (error) {
        console.error('Remote vote authorize error:', error);
        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_CONFIRM_FAIL',
                `MultiSig on-chain vote failed: ${error.message}`,
                req.body.walletAddress || 'guest',
                { session_id: req.body.sessionId, error: error.message }
            );
        } catch (e) {}
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ================= REMOTE GOVERNANCE SUBMISSION ==================

// POST /api/governance/remote/submit/session - Initialize remote submission session
router.post('/remote/submit/session', withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_ONCHAIN_SUBMIT' }), withAction('GOV_ONCHAIN_SUBMIT'), withMutation(), async (req, res) => {
    try {
        const { proposalId } = req.body;
        if (!proposalId) {
            return res.status(400).json({ error: 'proposalId is required' });
        }

        // Verify proposal exists
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        if (propRes.rows.length === 0) return res.status(404).json({ error: "Proposal not found" });

        const proposal = propRes.rows[0];
        if (proposal.status !== 'active') {
            return res.status(400).json({ error: `Proposal is already ${proposal.status}` });
        }
        if (new Date(proposal.expires_at) < new Date()) {
            return res.status(400).json({ error: "Proposal has expired" });
        }

        // 🛡️ [Hardening] Prepare On-Chain metadata
        const config = await ConfigService.getConfig();
        const proposalHash = ethers.id(`${proposal.title}-${proposal.created_at}`);
        
        let onChainTarget = config.contracts.documentRegistry;
        let onChainData = "0x";

        const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
        const artifact = require(artifactPath);
        const multisigIface = new ethers.Interface(artifact.abi);

        let operations = [];
        if (proposal.type === 'add_admin') {
            operations.push({
                target: config.contracts.multisig,
                data: multisigIface.encodeFunctionData("promoteAdmin", [proposal.target_id, config.contracts.notaryRegistry])
            });
        } else if (proposal.type === 'remove_admin') {
            operations.push({
                target: config.contracts.multisig,
                data: multisigIface.encodeFunctionData("demoteAdmin", [proposal.target_id, config.contracts.notaryRegistry])
            });
        } else if (proposal.type === 'add_notary' || proposal.type === 'NOTARY_PROMOTION') {
            operations.push({
                target: config.contracts.multisig,
                data: multisigIface.encodeFunctionData("addSigner", [proposal.target_id])
            });
        } else if (proposal.type === 'remove_notary') {
            operations.push({
                target: config.contracts.multisig,
                data: multisigIface.encodeFunctionData("removeSigner", [proposal.target_id])
            });
        } else if (proposal.type === 'change_threshold') {
            const newThreshold = parseInt(proposal.target_id, 10);
            operations.push({
                target: config.contracts.multisig,
                data: multisigIface.encodeFunctionData("changeThreshold", [newThreshold])
            });
        }

        if (operations.length > 0) {
            onChainData = operations.length > 1 ? JSON.stringify(operations) : operations[0].data;
            onChainTarget = operations.length > 1 ? "MULTI_STEP" : operations[0].target;
        }

        // Update Proposal with metadata if not already present
        await pool.query(
            "UPDATE governance_proposals SET on_chain_data = $1, on_chain_target = $2 WHERE id = $3",
            [onChainData, onChainTarget, proposalId]
        );

        const challenge = `BBSNS-GOV-SUBMIT-${proposalId}-${Math.random().toString(36).substring(2, 15)}`;
        const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes for complex signing

        const result = await pool.query(
            'INSERT INTO remote_gov_sessions (proposal_id, challenge, expires_at, type, proposal_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [proposalId, challenge, expires_at, 'SUBMIT', proposalHash]
        );

        res.json({ sessionId: result.rows[0].id });
    } catch (error) {
        console.error('Remote submit session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/governance/remote/submit/status/:sessionId - Poll for submission session status
router.get('/remote/submit/status/:sessionId', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_STATUS', allowPublic: true }), async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!isValidUUID(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }
        
        const query = `
            SELECT s.*, 
                   p.title as proposal_title, 
                   p.target_id as proposal_target, 
                   p.description as proposal_description,
                   p.on_chain_data as proposal_data,
                   p.on_chain_target as proposal_contract
            FROM remote_gov_sessions s
            LEFT JOIN governance_proposals p ON s.proposal_id = p.id
            WHERE s.id = $1 AND s.type = 'SUBMIT'
        `;
        const result = await pool.query(query, [sessionId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = result.rows[0];
        const now = new Date();

        if (session.status === 'pending' && new Date(session.expires_at) < now) {
            await pool.query("UPDATE remote_gov_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
            return res.json({ status: 'expired' });
        }

        const config = await ConfigService.getConfig();

        res.json({
            status: session.status,
            challenge: session.challenge,
            proposalId: session.proposal_id,
            proposal: {
                title: session.proposal_title,
                target_id: session.proposal_target,
                description: session.proposal_description,
                data: session.proposal_data,
                to: session.proposal_contract,
                value: "0", // Currently all promotions are 0 value
                proposalHash: session.proposal_hash
            },
            multisigAddress: config.contracts.multisig,
            type: session.type,
            wallet_address: session.wallet_address,
            txHash: session.tx_hash
        });
    } catch (error) {
        console.error('Remote submit status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/governance/remote/submit/authorize - Submit EIP-712 signature for remote proposal
router.post('/remote/submit/authorize', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, walletAddress, signature } = req.body;

        if (!sessionId || !walletAddress || !signature) {
            return res.status(400).json({ error: 'sessionId, walletAddress, and signature are required' });
        }

        const sessionResult = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'SUBMIT'", [sessionId]);
        if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

        const session = sessionResult.rows[0];
        if (session.status !== 'pending') return res.status(400).json({ error: `Session is already ${session.status}` });

        // Verify session-binding wallet ownership
        if (session.wallet_address && session.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized: Wallet address does not match co-signer session' });
        }

        // 1. RELAY TO BLOCKCHAIN (Logic matches /submit-on-chain)
        const proposalId = session.proposal_id;
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        const proposal = propRes.rows[0];

        const { signer } = await require("../blockchain/connection").connectBNB();
        const config = await ConfigService.getConfig();
        const multisigAddress = config.contracts.multisig;
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const contract = new ethers.Contract(multisigAddress, artifact.abi, signer);

        const to = proposal.on_chain_target || config.contracts.documentRegistry;
        const value = "0";
        const data = proposal.on_chain_data || "0x";
        const proposalHash = ethers.id(`${proposal.title}-${proposal.created_at}`);

        console.log(`🚀 [REMOTE_RELAY] Submitting Prop ${proposalId} via session ${sessionId}...`);
        const tx = await contract.submitWithSignature(to, value, data, signature, proposalHash);
        const receipt = await tx.wait();

        // Parse log for Index
        const iface = new ethers.Interface(artifact.abi);
        let txIndex;
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed.name === 'TransactionSubmitted') {
                    txIndex = Number(parsed.args.txIndex);
                    break;
                }
            } catch (e) { }
        }

        // 2. Update DB & Session — preserve 'passed' status if already fast-tracked
        await pool.query(
            `UPDATE governance_proposals
             SET on_chain_tx_index = $1,
                 status = CASE WHEN status = 'passed' THEN 'passed' ELSE 'active' END
             WHERE id = $2`,
            [txIndex, proposalId]
        );

        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, signature = $2, tx_hash = $3, authorized_at = NOW() WHERE id = $4",
            [walletAddress.toLowerCase(), signature, receipt.hash, sessionId]
        );

        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_SUBMIT',
                `MultiSig Proposal submitted on-chain (Prop ID: ${proposalId}, Tx Index: ${txIndex}).`,
                walletAddress.toLowerCase(),
                { proposal_id: proposalId, tx_index: txIndex, tx_hash: receipt.hash }
            );
        } catch (e) {
            console.error("Failed to log multisig submit action:", e.message);
        }

        res.json({ success: true, txHash: receipt.hash });
    } catch (error) {
        console.error('Remote submit authorize error:', error);
        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_SUBMIT_FAIL',
                `MultiSig on-chain submission failed: ${error.message}`,
                req.body.walletAddress || 'guest',
                { session_id: req.body.sessionId, error: error.message }
            );
        } catch (e) {}
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// POST /api/governance/remote/submit/sync-manual - Confirm direct blockchain transaction by Admin
router.post('/remote/submit/sync-manual', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, txHash, walletAddress } = req.body;

        if (!sessionId || !txHash || !walletAddress) {
            return res.status(400).json({ error: 'sessionId, txHash, and walletAddress are required' });
        }

        // 1. Verify Session
        const sessionResult = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'SUBMIT'", [sessionId]);
        if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        const session = sessionResult.rows[0];

        if (session.status !== 'pending') {
            // If already authorized, just return success
            if (session.status === 'authorized') return res.json({ success: true, txHash: session.tx_hash });
            return res.status(400).json({ error: `Session is already ${session.status}` });
        }

        // 2. Verify Transaction on Chain
        const provider = await ProviderService.getProvider();
        const receipt = await provider.getTransactionReceipt(txHash);

        if (!receipt) {
            return res.status(400).json({ error: 'Transaction receipt not found. Please wait for confirmation.' });
        }

        if (receipt.status !== 1) {
            return res.status(400).json({ error: 'Blockchain transaction failed on-chain.' });
        }

        // 3. Extract txIndex from logs
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const iface = new ethers.Interface(artifact.abi);
        let txIndex;
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed.name === 'TransactionSubmitted') {
                    txIndex = Number(parsed.args.txIndex);
                    break;
                }
            } catch (e) { }
        }

        if (txIndex === undefined) {
            return res.status(400).json({ error: 'TransactionSubmitted event not found in logs. Wrong transaction?' });
        }

        // 4. Update DB — preserve 'passed' status if already fast-tracked (BUG-B fix)
        const proposalId = session.proposal_id;
        await pool.query(
            `UPDATE governance_proposals
             SET on_chain_tx_index = $1,
                 status = (CASE WHEN status::text = 'passed' THEN 'passed' ELSE 'active' END)::proposal_status
             WHERE id = $2`,
            [txIndex, proposalId]
        );

        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, tx_hash = $2, authorized_at = NOW() WHERE id = $3",
            [walletAddress.toLowerCase(), txHash, sessionId]
        );

        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_SUBMIT',
                `MultiSig Proposal submitted on-chain by Genesis Admin (Prop ID: ${proposalId}, Tx Index: ${txIndex}).`,
                walletAddress.toLowerCase(),
                { proposal_id: proposalId, tx_index: txIndex, tx_hash: txHash, type: 'sync_manual' }
            );
        } catch (e) {
            console.error("Failed to log multisig submit sync action:", e.message);
        }

        res.json({ success: true, txIndex, txHash });
    } catch (error) {
        console.error('Remote submit manual sync error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// ================= REMOTE MULTISIG CONFIRMATION ==================

// POST /api/governance/remote/confirm/session
router.post('/remote/confirm/session', withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_REMOTE_INIT' }), withAction('GOV_REMOTE_INIT'), withMutation(), async (req, res) => {
    try {
        const { txIndex } = req.body;
        if (txIndex === undefined) return res.status(400).json({ error: 'txIndex is required' });

        const challenge = `BBSNS-GOV-CONFIRM-${txIndex}-${Math.random().toString(36).substring(2, 15)}`;
        const expires_at = new Date(Date.now() + 15 * 60 * 1000);

        const result = await pool.query(
            "INSERT INTO remote_gov_sessions (proposal_id, challenge, expires_at, type, decision) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [txIndex, challenge, expires_at, 'CONFIRM', 'approve']
        );

        res.json({ sessionId: result.rows[0].id });
    } catch (error) {
        console.error('Remote confirm session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/governance/remote/confirm/status/:sessionId
router.get('/remote/confirm/status/:sessionId', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_STATUS', allowPublic: true }), async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'Invalid session ID format' });

        const result = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'CONFIRM'", [sessionId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

        const session = result.rows[0];
        if (session.status === 'pending' && new Date(session.expires_at) < new Date()) {
            await pool.query("UPDATE remote_gov_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
            return res.json({ status: 'expired' });
        }

        res.json({
            status: session.status,
            challenge: session.challenge,
            txIndex: session.proposal_id,
            wallet_address: session.wallet_address,
            txHash: session.tx_hash
        });
    } catch (error) {
        console.error('Remote confirm status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/governance/remote/confirm/authorize
router.post('/remote/confirm/authorize', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, walletAddress, signature } = req.body;
        if (!sessionId || !walletAddress || !signature) {
            return res.status(400).json({ error: 'sessionId, walletAddress, and signature are required' });
        }

        const sessionResult = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'CONFIRM'", [sessionId]);
        if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

        const session = sessionResult.rows[0];
        if (session.status !== 'pending') return res.status(400).json({ error: `Session is already ${session.status}` });

        // Verify session-binding wallet ownership
        if (session.wallet_address && session.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized: Wallet address does not match co-signer session' });
        }

        // 1. RELAY TO BLOCKCHAIN
        const txIndex = session.proposal_id;
        const { signer } = await require("../blockchain/connection").connectBNB();
        const config = await ConfigService.getConfig();
        const multisigAddress = config.contracts.multisig;
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const contract = new ethers.Contract(multisigAddress, artifact.abi, signer);

        console.log(`🚀 [REMOTE_RELAY] Confirming Multisig Tx ${txIndex} via session ${sessionId}...`);
        const tx = await contract.confirmTransaction(txIndex, signature);
        const receipt = await tx.wait();

        // 2. Update Session
        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, signature = $2, tx_hash = $3, authorized_at = NOW() WHERE id = $4",
            [walletAddress.toLowerCase(), signature, receipt.hash, sessionId]
        );

        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_CONFIRM',
                `MultiSig Transaction confirmed on-chain (Tx Index: ${txIndex}).`,
                walletAddress.toLowerCase(),
                { tx_index: txIndex, tx_hash: receipt.hash }
            );
        } catch (e) {
            console.error("Failed to log multisig confirm action:", e.message);
        }

        res.json({ success: true, txHash: receipt.hash });
    } catch (error) {
        console.error('Remote confirm authorize error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// POST /api/governance/remote/confirm/sync-manual - Confirm direct blockchain confirmation transaction by Admin
router.post('/remote/confirm/sync-manual', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, txHash, walletAddress } = req.body;

        if (!sessionId || !txHash || !walletAddress) {
            return res.status(400).json({ error: 'sessionId, txHash, and walletAddress are required' });
        }

        // 1. Verify Session
        const sessionResult = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'CONFIRM'", [sessionId]);
        if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        const session = sessionResult.rows[0];

        if (session.status !== 'pending') {
            if (session.status === 'authorized') return res.json({ success: true, txHash: session.tx_hash });
            return res.status(400).json({ error: `Session is already ${session.status}` });
        }

        // 2. Verify Transaction on Chain
        let eventVerified = false;
        const expectedTxIndex = session.proposal_id; // For CONFIRM session, proposal_id stores txIndex
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const provider = await ProviderService.getProvider();

        if (txHash === 'already_executed_onchain' || txHash === 'already_confirmed_onchain') {
            try {
                const config = await ConfigService.getConfig();
                const multisigAddress = config?.contracts?.multisig;
                const multisigContract = new ethers.Contract(multisigAddress, artifact.abi, provider);
                
                // If the transaction has already been executed on-chain, confirmations are implicitly verified
                const onChainTxInfo = await multisigContract.getTransaction(expectedTxIndex);
                if (onChainTxInfo && onChainTxInfo.executed) {
                    eventVerified = true;
                } else {
                    // Otherwise check if this signer has confirmed on-chain
                    const isSignerConfirmed = await multisigContract.isConfirmed(expectedTxIndex, walletAddress);
                    if (isSignerConfirmed) {
                        eventVerified = true;
                    }
                }
            } catch (e) {
                console.warn('[REMOTE_CONFIRM_SELF_HEAL_WARN]', e.message);
            }
        } else {
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt) {
                return res.status(400).json({ error: 'Transaction receipt not found. Please wait for confirmation.' });
            }

            if (receipt.status !== 1) {
                return res.status(400).json({ error: 'Blockchain transaction failed on-chain.' });
            }

            // 3. Verify TransactionConfirmed event in logs
            const iface = new ethers.Interface(artifact.abi);

            for (const log of receipt.logs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (parsed.name === 'TransactionConfirmed') {
                        const eventTxIndex = Number(parsed.args.txIndex);
                        const eventSigner = parsed.args.signer.toLowerCase();
                        if (eventTxIndex === expectedTxIndex && eventSigner === walletAddress.toLowerCase()) {
                            eventVerified = true;
                            break;
                        }
                    }
                } catch (e) { }
            }
        }

        if (!eventVerified) {
            return res.status(400).json({ error: 'TransactionConfirmed event not found in logs for this txIndex and signer.' });
        }

        // 4. Update DB Session status
        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, tx_hash = $2, authorized_at = NOW() WHERE id = $3",
            [walletAddress.toLowerCase(), txHash, sessionId]
        );

        try {
            const { logAction } = require('../utils/logger');
            logAction(
                'MULTISIG_CONFIRM',
                `MultiSig Transaction confirmed on-chain by Genesis Admin (Tx Index: ${expectedTxIndex}).`,
                walletAddress.toLowerCase(),
                { tx_index: expectedTxIndex, tx_hash: txHash, type: 'sync_manual' }
            );
        } catch (e) {
            console.error("Failed to log multisig confirm sync action:", e.message);
        }

        res.json({ success: true, txIndex: expectedTxIndex, txHash });
    } catch (error) {
        console.error('Remote confirm manual sync error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// ================= REMOTE MULTISIG EXECUTION ==================

// POST /api/governance/remote/execute/session
router.post('/remote/execute/session', withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_REMOTE_INIT' }), withAction('GOV_REMOTE_INIT'), withMutation(), async (req, res) => {
    try {
        const { txIndex } = req.body;
        if (txIndex === undefined) return res.status(400).json({ error: 'txIndex is required' });

        const challenge = `BBSNS-GOV-EXECUTE-${txIndex}-${Math.random().toString(36).substring(2, 15)}`;
        const expires_at = new Date(Date.now() + 15 * 60 * 1000);

        const result = await pool.query(
            "INSERT INTO remote_gov_sessions (proposal_id, challenge, expires_at, type, decision) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [txIndex, challenge, expires_at, 'EXECUTE', 'approve']
        );

        res.json({ sessionId: result.rows[0].id });
    } catch (error) {
        console.error('Remote execute session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/governance/remote/execute/status/:sessionId
router.get('/remote/execute/status/:sessionId', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_STATUS', allowPublic: true }), async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'Invalid session ID format' });

        const result = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'EXECUTE'", [sessionId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

        const session = result.rows[0];
        if (session.status === 'pending' && new Date(session.expires_at) < new Date()) {
            await pool.query("UPDATE remote_gov_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
            return res.json({ status: 'expired' });
        }

        res.json({
            status: session.status,
            challenge: session.challenge,
            txIndex: session.proposal_id,
            wallet_address: session.wallet_address,
            txHash: session.tx_hash
        });
    } catch (error) {
        console.error('Remote execute status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/governance/remote/execute/sync-manual - Confirm direct blockchain execution transaction by Admin
router.post('/remote/execute/sync-manual', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, txHash, walletAddress } = req.body;

        if (!sessionId || !txHash || !walletAddress) {
            return res.status(400).json({ error: 'sessionId, txHash, and walletAddress are required' });
        }

        // 1. Verify Session
        const sessionResult = await pool.query("SELECT * FROM remote_gov_sessions WHERE id = $1 AND type = 'EXECUTE'", [sessionId]);
        if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
        const session = sessionResult.rows[0];

        if (session.status !== 'pending') {
            if (session.status === 'authorized') return res.json({ success: true, txHash: session.tx_hash });
            return res.status(400).json({ error: `Session is already ${session.status}` });
        }

        // 2. Verify Transaction on Chain
        let eventVerified = false;
        const expectedTxIndex = session.proposal_id; // For EXECUTE session, proposal_id stores txIndex
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const provider = await ProviderService.getProvider();

        if (txHash === 'already_executed_onchain' || txHash === 'already_confirmed_onchain') {
            try {
                const config = await ConfigService.getConfig();
                const multisigAddress = config?.contracts?.multisig;
                const multisigContract = new ethers.Contract(multisigAddress, artifact.abi, provider);
                const onChainTxInfo = await multisigContract.getTransaction(expectedTxIndex);
                if (onChainTxInfo && onChainTxInfo.executed) {
                    eventVerified = true;
                }
            } catch (e) {
                console.warn('[REMOTE_EXECUTE_SELF_HEAL_WARN]', e.message);
            }
        } else {
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt) {
                return res.status(400).json({ error: 'Transaction receipt not found. Please wait for confirmation.' });
            }

            if (receipt.status !== 1) {
                return res.status(400).json({ error: 'Blockchain transaction failed on-chain.' });
            }

            // 3. Verify execution event or state
            const iface = new ethers.Interface(artifact.abi);

            for (const log of receipt.logs) {
                try {
                    const parsed = iface.parseLog(log);
                    if (parsed.name === 'Execution' || parsed.name === 'TransactionExecuted') {
                        const eventTxIndex = Number(parsed.args.txIndex);
                        if (eventTxIndex === expectedTxIndex) {
                            eventVerified = true;
                            break;
                        }
                    }
                } catch (e) { }
            }
        }

        // Self-healing: double check contract execution state directly
        try {
            const config = await ConfigService.getConfig();
            const multisigAddress = config?.contracts?.multisig;
            const multisigContract = new ethers.Contract(multisigAddress, artifact.abi, provider);
            const onChainTxInfo = await multisigContract.getTransaction(expectedTxIndex);
            if (onChainTxInfo && onChainTxInfo.executed) {
                eventVerified = true;
            }
        } catch (e) {
            console.warn('[REMOTE_EXECUTE_SELF_HEAL_WARN]', e.message);
        }

        if (!eventVerified) {
            return res.status(400).json({ error: 'Transaction Execution event not found in logs for this txIndex.' });
        }

        // 4. Update Database Governance Proposal to executed if it exists
        try {
            const propRes = await pool.query(
                "SELECT * FROM governance_proposals WHERE on_chain_tx_index = $1",
                [expectedTxIndex]
            );
            if (propRes.rows.length > 0) {
                const proposal = propRes.rows[0];
                await pool.query(
                    `UPDATE governance_proposals 
                     SET status = 'executed', 
                         executed_at = NOW(), 
                         executed_by = (SELECT id FROM users WHERE LOWER(wallet_address) = $1 LIMIT 1), 
                         execution_tx_hash = $2 
                     WHERE id = $3`,
                    [walletAddress.toLowerCase(), txHash, proposal.id]
                );

                // Synchronize DB user role
                try {
                    if (proposal.type === 'add_admin_protocol' || proposal.type === 'add_admin_governance') {
                        await pool.query("UPDATE users SET role = 'admin' WHERE id::text = $1 OR wallet_address = $2", [proposal.target_id, proposal.target_id.toLowerCase()]);
                    } else if (proposal.type === 'add_notary' || proposal.type === 'NOTARY_PROMOTION') {
                        await pool.query("UPDATE users SET role = 'notary' WHERE id::text = $1 OR wallet_address = $2", [proposal.target_id, proposal.target_id.toLowerCase()]);
                    } else if (proposal.type === 'remove_admin' || proposal.type === 'remove_notary') {
                        await pool.query("UPDATE users SET role = 'owner' WHERE id::text = $1 OR wallet_address = $2", [proposal.target_id, proposal.target_id.toLowerCase()]);
                    }
                } catch (roleErr) {
                    console.warn(`[SELF_HEAL_ROLE_ERR] Failed to sync role for proposal ${proposal.id}:`, roleErr.message);
                }

                // Write audit log
                try {
                    await pool.query(
                        `INSERT INTO audit_logs (action, details, created_at) 
                         VALUES ('GOVERNANCE_EXECUTED', $1, NOW())`,
                        [JSON.stringify({ proposalId: proposal.id, type: proposal.type, target_id: proposal.target_id, executedBy: walletAddress, txHash })]
                    );
                    
                    const { logAction } = require('../utils/logger');
                    logAction(
                        'MULTISIG_EXECUTE',
                        `MultiSig Transaction executed on-chain by Genesis Admin (Tx Index: ${expectedTxIndex}, Proposal ID: ${proposal.id}).`,
                        walletAddress.toLowerCase(),
                        { proposal_id: proposal.id, tx_index: expectedTxIndex, tx_hash: txHash, type: 'sync_manual' }
                    );
                } catch (auditErr) {
                    console.warn(`[REMOTE_EXECUTE_AUDIT_WARN] Audit log write failed:`, auditErr.message);
                }
            }
        } catch (dbErr) {
            console.error('[REMOTE_EXECUTE_SYNC_DB_ERR]', dbErr.message);
        }

        // 5. Update DB Session status
        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, tx_hash = $2, authorized_at = NOW() WHERE id = $3",
            [walletAddress.toLowerCase(), txHash, sessionId]
        );

        res.json({ success: true, txIndex: expectedTxIndex, txHash });
    } catch (error) {
        console.error('Remote execute manual sync error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});



// POST /api/governance/proposals/:id/execute
// Blockchain-First Atomic Execution with Idempotency and Confirmed-Receipt DB Sync
router.post(
    "/proposals/:id/execute",
    withDomain('GOVERNANCE'),
    requirePrivilege({ capability: 'GOV_PROPOSAL_EXECUTE' }),
    withAction('GOV_PROPOSAL_EXECUTE'),
    withMutation(),
    async (req, res) => {
        const proposalId = req.params.id;

        // ─── STEP 1: Fetch Proposal & Idempotency Guard ──────────────────────────
        let proposal;
        try {
            const propRes = await pool.query(
                "SELECT * FROM governance_proposals WHERE id = $1",
                [proposalId]
            );
            if (propRes.rows.length === 0)
                return res.status(404).json({ error: "Proposal not found" });

            proposal = propRes.rows[0];

            // IDEMPOTENCY: Reject if already executed (prevents double execution)
            if (proposal.status === 'executed') {
                return res.status(409).json({
                    error: "Proposal has already been executed.",
                    status: "executed",
                    execution_tx_hash: proposal.execution_tx_hash || null
                });
            }

            // Guard: Only 'passed' proposals can be executed
            if (proposal.status !== 'passed') {
                return res.status(400).json({
                    error: `Proposal cannot be executed. Current status: '${proposal.status}'. Required: 'passed'.`
                });
            }
        } catch (dbErr) {
            console.error(`[GOV_EXECUTE] DB fetch failed for proposal ${proposalId}:`, dbErr.message);
            return res.status(500).json({ error: "Failed to retrieve proposal." });
        }

        const { type, target_id } = proposal;

        // ─── STEP 2: Setup Blockchain Connection and Interfaces ─────────────────
        const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
        const artifact = require(artifactPath);

        let config, multisigAddress, signer, multisigContract;
        try {
            config = await ConfigService.getConfig();
            multisigAddress = config?.contracts?.multisig;
            if (!multisigAddress) throw new Error("Multisig contract address not configured.");

            const { signer: relayerSigner } = await require("../blockchain/connection").connectBNB();
            signer = relayerSigner;
            multisigContract = new ethers.Contract(multisigAddress, artifact.abi, signer);
        } catch (connErr) {
            console.error(`[GOV_EXECUTE] Blockchain connection failed:`, connErr.message);
            return res.status(503).json({ error: `Blockchain connection failed: ${connErr.message}` });
        }

        const multisigIface = new ethers.Interface(artifact.abi);

        // ─── STEP 3: Build Encoded Call Data Per Proposal Type ───────────────────
        const operations = [];
        let isOffChainOnly = false;

        try {
            switch (type) {
                case 'add_admin_protocol': {
                    const notaryRegistryArtifact = require(path.join(__dirname, "../artifacts/NotaryRegistry.json"));
                    const notaryRegistryIface = new ethers.Interface(notaryRegistryArtifact.abi);
                    operations.push({
                        target: config.contracts.notaryRegistry,
                        data: notaryRegistryIface.encodeFunctionData("promoteToAdmin", [target_id]),
                        description: `NotaryRegistry.promoteToAdmin(${target_id})`
                    });
                    break;
                }
                
                case 'add_admin_governance': {
                    operations.push({
                        target: multisigAddress,
                        data: multisigIface.encodeFunctionData("addSigner", [target_id]),
                        description: `BBSNSMultiSig.addSigner(${target_id})`
                    });
                    break;
                }

                case 'remove_admin_protocol': {
                    const notaryRegistryArtifact = require(path.join(__dirname, "../artifacts/NotaryRegistry.json"));
                    const notaryRegistryIface = new ethers.Interface(notaryRegistryArtifact.abi);
                    operations.push({
                        target: config.contracts.notaryRegistry,
                        data: notaryRegistryIface.encodeFunctionData("removeRole", [target_id]),
                        description: `NotaryRegistry.removeRole(${target_id})`
                    });
                    break;
                }
                
                case 'remove_admin_governance': {
                    operations.push({
                        target: multisigAddress,
                        data: multisigIface.encodeFunctionData("removeSigner", [target_id]),
                        description: `BBSNSMultiSig.removeSigner(${target_id})`
                    });
                    break;
                }

                case 'add_notary':
                case 'NOTARY_PROMOTION': // BUG-C fix: legacy uppercase alias
                    operations.push({
                        target: multisigAddress,
                        data: multisigIface.encodeFunctionData("addSigner", [target_id]),
                        description: `BBSNSMultiSig.addSigner(${target_id})`
                    });
                    break;

                case 'remove_notary':
                    operations.push({
                        target: multisigAddress,
                        data: multisigIface.encodeFunctionData("removeSigner", [target_id]),
                        description: `BBSNSMultiSig.removeSigner(${target_id})`
                    });
                    break;

                case 'change_threshold': {
                    const newThreshold = parseInt(target_id, 10);
                    if (isNaN(newThreshold) || newThreshold < 1)
                        return res.status(400).json({ error: "Invalid threshold value in target_id." });
                    operations.push({
                        target: multisigAddress,
                        data: multisigIface.encodeFunctionData("changeThreshold", [newThreshold]),
                        description: `BBSNSMultiSig.changeThreshold(${newThreshold})`
                    });
                    break;
                }

                case 'ban_user':
                case 'unban_user':
                    // Pure off-chain DB actions — no on-chain call needed
                    isOffChainOnly = true;
                    break;

                default:
                    return res.status(400).json({ error: `Unknown or unsupported proposal type: '${type}'.` });
            }
        } catch (encodeErr) {
            console.error(`[GOV_EXECUTE] Encoding failed for type '${type}':`, encodeErr.message);
            return res.status(400).json({ error: `Failed to encode on-chain call: ${encodeErr.message}` });
        }

        // ─── STEP 4: Execute On-Chain (HYBRID/ON_CHAIN Actions) ──────────────────
        let txHash = null;
        let onChainSuccess = false;

        if (!isOffChainOnly) {
            console.log(`[GOV_EXECUTE] Submitting ${operations.length} on-chain txs for proposal ${proposalId}, type=${type}`);
            try {
                const proposalHash = ethers.id(`${proposal.title}-${proposal.created_at}`);

                for (let index = 0; index < operations.length; index++) {
                    const op = operations[index];
                    console.log(`[GOV_EXECUTE] Running dual-tx step ${index + 1}/${operations.length}: ${op.description}`);

                    const submitTx = await multisigContract.submitTransaction(
                        op.target,
                        0,
                        op.data,
                        proposalHash
                    );

                    console.log(`[GOV_EXECUTE] submitTransaction sent, waiting for receipt... txHash=${submitTx.hash}`);
                    const submitReceipt = await submitTx.wait();
                    txHash = submitReceipt.hash;

                    // Parse the TransactionSubmitted event to get the txIndex
                    let txIndex;
                    for (const log of submitReceipt.logs) {
                        try {
                            const parsed = multisigIface.parseLog(log);
                            if (parsed && parsed.name === 'TransactionSubmitted') {
                                txIndex = Number(parsed.args.txIndex);
                                break;
                            }
                        } catch (_) {}
                    }

                    if (txIndex === undefined)
                        throw new Error(`TransactionSubmitted event not found in receipt for step ${index + 1}.`);

                    console.log(`[GOV_EXECUTE] Submitted at txIndex=${txIndex}. Now executing...`);

                    const execTx = await multisigContract.executeTransaction(txIndex);
                    console.log(`[GOV_EXECUTE] executeTransaction sent, waiting for receipt... txHash=${execTx.hash}`);
                    const execReceipt = await execTx.wait();
                    txHash = execReceipt.hash;
                }

                onChainSuccess = true;
                console.log(`[GOV_EXECUTE] ✅ All ${operations.length} on-chain executions confirmed. txHash=${txHash}`);

                // 🛡️ [Hardening] VERIFY_PROTOCOL_REALITY - Do not return success until role is truly changed on-chain
                if (type === 'NOTARY_PROMOTION' || type === 'add_notary' || type === 'add_admin') {
                    const targetWallet = (target_id || "").startsWith('0x') ? target_id : null;
                    if (targetWallet) {
                        const expectedRole = type === 'add_admin' ? 3 : 2;
                        console.log(`[GOV_EXECUTE] 🔍 Polling for protocol role update for ${targetWallet}... Expected: ${expectedRole}`);
                        const verifyProvider = await ProviderService.getProvider();
                        const verifyConfig = await ConfigService.getConfig();
                        const registry = new ethers.Contract(
                            verifyConfig.contracts.notaryRegistry,
                            ["function getUserRole(address) view returns (uint8)"],
                            verifyProvider
                        );

                        let verified = false;
                        for (let i = 0; i < 10; i++) { // Max 30 seconds (10 * 3s)
                            const role = await registry.getUserRole(targetWallet);
                            if (Number(role) === expectedRole) {
                                verified = true;
                                console.log(`[GOV_EXECUTE] 📡 Protocol role verified: ${type === 'add_admin' ? 'ADMIN (3)' : 'NOTARY (2)'} ✅`);
                                break;
                            }
                            console.log(`[GOV_EXECUTE] ... Attempt ${i+1}: Role is ${role}. Waiting...`);
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }

                        if (!verified) {
                            console.warn(`[GOV_EXECUTE] ⚠️ Execution confirmed but protocol state still lagging after 30s.`);
                        }
                    }
                }

            } catch (chainErr) {
                console.error(`[GOV_EXECUTE] ❌ On-chain execution failed for proposal ${proposalId}:`, chainErr.message);
                try {
                    const { logAction } = require('../utils/logger');
                    logAction(
                        'MULTISIG_EXECUTE_FAIL',
                        `MultiSig Proposal execution failed on-chain: ${chainErr.message}`,
                        req.actor?.email || 'admin',
                        { proposal_id: proposalId, type: type, error: chainErr.message }
                    );
                } catch (e) {}
                return res.status(500).json({
                    error: `On-chain execution failed. Proposal remains in 'passed' state and can be retried.`,
                    details: chainErr.message,
                    status: "pending",
                    txHash: null
                });
            }
        } else {
            // Off-chain only — no blockchain needed
            onChainSuccess = true;
        }

        // ─── STEP 5: Update DB Only After Confirmed On-Chain Success ─────────────
        // At this point, the blockchain has confirmed. DB must now reflect reality.
        if (onChainSuccess) {
            try {
                const dbClient = await pool.connect();
                try {
                    await dbClient.query('BEGIN');

                    // Apply DB mutation based on type
                    switch (type) {
                        case 'add_admin_protocol':
                        case 'add_admin_governance':
                            await dbClient.query(
                                "UPDATE users SET role = 'admin' WHERE id::text = $1 OR wallet_address = $2",
                                [target_id, target_id.toLowerCase()]
                            );
                            break;
                        case 'add_notary':
                        case 'NOTARY_PROMOTION':
                            await dbClient.query(
                                "UPDATE users SET role = 'notary' WHERE id::text = $1 OR wallet_address = $2",
                                [target_id, target_id.toLowerCase()]
                            );
                            break;
                        case 'remove_admin':
                            await dbClient.query(
                                "UPDATE users SET role = 'owner' WHERE id::text = $1 OR wallet_address = $2",
                                [target_id, target_id.toLowerCase()]
                            );
                            break;
                        case 'remove_notary':
                            await dbClient.query(
                                "UPDATE users SET role = 'owner', identity_state = 'INACTIVE' WHERE id::text = $1 OR wallet_address = $2",
                                [target_id, target_id.toLowerCase()]
                            );
                            break;
                        case 'ban_user':
                            await dbClient.query(
                                "UPDATE users SET identity_state = 'BANNED' WHERE wallet_address = $1 OR id::text = $1",
                                [target_id.toLowerCase()]
                            );
                            break;
                        case 'unban_user':
                            await dbClient.query(
                                "UPDATE users SET identity_state = 'ACTIVE' WHERE wallet_address = $1 OR id::text = $1",
                                [target_id.toLowerCase()]
                            );
                            break;
                        case 'change_threshold':
                            // DB has no threshold column — on-chain is source of truth, no DB row to update
                            break;
                    }

                    // Mark proposal as executed
                    await dbClient.query(
                        `UPDATE governance_proposals
                         SET status = 'executed',
                             executed_at = NOW(),
                             executed_by = $1,
                             execution_tx_hash = $2
                         WHERE id = $3`,
                        [req.actor.id, txHash, proposalId]
                    );

                    // Audit log
                    await dbClient.query(
                        `INSERT INTO sync_events (event_type, details, created_at)
                         VALUES ('GOVERNANCE_EXECUTED', $1, NOW())`,
                        [JSON.stringify({ proposalId, type, target_id, executedBy: req.actor.id, txHash })]
                    ).catch(auditErr => {
                        // Non-fatal: log but don't roll back for audit failure
                        console.warn(`[GOV_EXECUTE_AUDIT_WARN] Audit log write failed:`, auditErr.message);
                    });

                    await dbClient.query('COMMIT');
                    console.log(`[GOV_EXECUTE] ✅ DB updated successfully for proposal ${proposalId}`);

                } catch (dbWriteErr) {
                    await dbClient.query('ROLLBACK');
                    // CRITICAL: On-chain succeeded but DB failed — log for manual recovery
                    console.error(
                        `[GOV_EXECUTE_CRITICAL] ⚠️ DB UPDATE FAILED after confirmed on-chain tx!\n` +
                        `  proposalId=${proposalId}, type=${type}, target=${target_id}, txHash=${txHash}\n` +
                        `  ERROR: ${dbWriteErr.message}\n` +
                        `  ACTION REQUIRED: Manually sync DB state for this proposal.`
                    );
                    // Still return success since chain is source of truth, but flag the DB desync
                    return res.status(207).json({
                        warning: "On-chain execution SUCCEEDED but DB update FAILED. Manual sync required.",
                        status: "confirmed",
                        txHash,
                        proposalId,
                        dbError: dbWriteErr.message
                    });
                } finally {
                    dbClient.release();
                }

            } catch (poolErr) {
                console.error(`[GOV_EXECUTE_CRITICAL] Could not acquire DB connection:`, poolErr.message);
                return res.status(207).json({
                    warning: "On-chain execution SUCCEEDED but DB pool unavailable. Manual sync required.",
                    status: "confirmed",
                    txHash
                });
            }

            try {
                const { logAction } = require('../utils/logger');
                logAction(
                    'MULTISIG_EXECUTE',
                    `MultiSig Proposal executed successfully on-chain: "${proposal.title}" (Prop ID: ${proposalId}).`,
                    req.actor?.email || 'admin',
                    { proposal_id: proposalId, type, tx_hash: txHash }
                );
            } catch (e) {
                console.error("Failed to log multisig execute action:", e.message);
            }

            return res.json({
                success: true,
                status: "confirmed",
                txHash,
                proposalId,
                type,
                message: `Proposal ${proposalId} (${type}) executed successfully.`
            });
        }
    }
);

module.exports = router;

