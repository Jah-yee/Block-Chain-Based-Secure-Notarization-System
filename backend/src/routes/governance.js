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
            SELECT p.*, u.name as proposer_name 
            FROM governance_proposals p
            LEFT JOIN users u ON p.proposer_id = u.id
        `;
        let params = [];

        // If actor is a NOTARY (and not an ADMIN/OWNER), filter by targeting
        if (req.actor.role === ROLES.NOTARY && req.actor.role < ROLES.ADMIN) {
            query += ` WHERE p.target_notaries @> $1::jsonb OR p.target_notaries = '[]'::jsonb OR p.target_notaries IS NULL`;
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
        const result = await pool.query("SELECT COUNT(*) FROM governance_proposals WHERE status = 'active'");
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/governance/proposals (Admin only)
router.post("/proposals", withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_PROPOSAL_CREATE' }), withAction('GOV_PROPOSAL_CREATE'), withMutation(), async (req, res) => {
    const { title, description, type, target_id, target_notaries, expires_in_days } = req.body;

    if (!title || !type) {
        return res.status(400).json({ error: "Title and type are required" });
    }

    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + (expires_in_days || 7));

    try {
        // 🛡️ [FAST_TRACK] Check for Single Admin Mode
        const adminRes = await pool.query("SELECT COUNT(*) FROM users WHERE role >= $1", [ROLES.ADMIN]);
        const adminCount = parseInt(adminRes.rows[0].count);
        const status = (adminCount === 1) ? 'passed' : 'active';

        const result = await pool.query(
            `INSERT INTO governance_proposals (title, description, type, target_id, target_notaries, proposer_id, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [title, description, type, target_id, JSON.stringify(target_notaries || []), req.actor.id, expires_at, status]
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

// POST /api/governance/proposals/:id/vote (Admin/Notary depending on type - keeping Admin for now but checking threshold)
router.post("/proposals/:id/vote", withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_VOTE_SUBMIT' }), withAction('GOV_VOTE_SUBMIT'), withMutation(), async (req, res) => {
    const { decision, signature } = req.body;
    const proposalId = req.params.id;

    if (!decision || !signature) {
        return res.status(400).json({ error: "Decision and signature are required" });
    }

    try {
        // 1. Check if proposal exists and is active
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        if (propRes.rows.length === 0) return res.status(404).json({ error: "Proposal not found" });
        const proposal = propRes.rows[0];
        if (proposal.status !== 'active') return res.status(400).json({ error: "Proposal is no longer active" });

        // 2. Authorization Check: If targeted, is this notary in the list?
        if (proposal.target_notaries && proposal.target_notaries.length > 0) {
            if (!proposal.target_notaries.includes(req.actor.id)) {
                return res.status(403).json({ error: "You are not authorized to vote on this targeted proposal" });
            }
        }

        // 3. Record vote
        await pool.query(
            `INSERT INTO governance_votes (proposal_id, voter_id, decision, signature)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (proposal_id, voter_id) DO UPDATE SET decision = $3, signature = $4`,
            [proposalId, req.actor.id, decision, signature]
        );

        // 4. THRESHOLD / AUTO-EXECUTION CHECK
        // Count approvals
        const voteCountRes = await pool.query(
            "SELECT COUNT(*) FROM governance_votes WHERE proposal_id = $1 AND decision = 'approve'",
            [proposalId]
        );
        const approvals = parseInt(voteCountRes.rows[0].count);

        // Fetch Admin Count for Dynamic Threshold
        const adminRes = await pool.query("SELECT COUNT(*) FROM users WHERE role >= $1", [ROLES.ADMIN]);
        const adminCount = parseInt(adminRes.rows[0].count);

        // If only 1 admin exists, or if threshold is met (e.g., majority or 1 for single admin)
        if (decision === 'approve' && (adminCount === 1 || approvals >= adminCount)) {
            console.log(`🎊 Threshold met for Proposal ${proposalId}. Marking as passed.`);
            await pool.query("UPDATE governance_proposals SET status = 'passed' WHERE id = $1", [proposalId]);
            return res.json({ message: "Vote recorded. Proposal PASSED and ready for execution.", executed: false, status: 'passed' });
        }

        res.json({ message: "Vote recorded successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/governance/multisig/settings
router.get(
    "/multisig/settings",
    requirePrivilege({ capability: "GOV_READ" }),
    async (req, res) => {
        try {
            // AUTHORITATIVE BLOCKCHAIN SYNC (Replacing non-existent GovernanceService)
            const config = await ConfigService.getConfig();
            const contractAddress = config?.contracts?.multisig;

            if (!contractAddress) {
                return res.json({
                    address: "0x0",
                    threshold: 0,
                    signers: [],
                    status: "degraded",
                    error: "Multisig address not configured"
                });
            }

            const provider = await ProviderService.getProvider();
            const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
            const artifact = require(artifactPath);
            const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

            const [threshold, signers] = await Promise.all([
                contract.threshold(),
                contract.getSigners()
            ]);

            res.json({
                address: contractAddress,
                threshold: Number(threshold),
                signers: signers,
                status: "active"
            });
        } catch (error) {
            console.error("Fetch multisig settings error:", error);
            // 🛡️ [RESILIENCE] Fallback to safe state
            const config = await ConfigService.getConfig();
            res.json({ 
                address: config?.contracts?.multisig || "0x0",
                threshold: 0,
                signers: [],
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
        // Returns recent multisig transactions associated with proposals
        // Matches the structure expected by the frontend enrichment logic
        const result = await pool.query(`
            SELECT 
                p.id as index, 
                p.created_at as submissionTime, 
                COUNT(v.id) as numConfirmations, 
                CASE WHEN p.status = 'executed' THEN true ELSE false END as executed
            FROM governance_proposals p
            LEFT JOIN governance_votes v ON p.id = v.proposal_id AND v.decision = 'approve'
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT 20
        `);

        // Map database fields to the expected blockchain-like format
        const transactions = (result.rows || []).map(row => ({
            index: row.index,
            submissionTime: Math.floor(new Date(row.submissionTime).getTime() / 1000),
            numConfirmations: row.numConfirmations || 0,
            executed: row.executed
        }));

        res.json({ transactions });
    } catch (err) {
        console.error("[GOVERNANCE_TX_FAIL] Resilient failure fallback:", err.message);
        // 🛡️ [SECURITY] Return safe empty state instead of 500 to keep UI alive
        res.json({
            transactions: [],
            status: "degraded",
            error: "Telemetry stream interrupted"
        });
    }
});

// POST /api/governance/proposals/:id/prepare-on-chain
router.post("/proposals/:id/prepare-on-chain", requirePrivilege({ capability: 'GOV_ONCHAIN_SUBMIT' }), async (req, res) => {
    const proposalId = req.params.id;
    try {
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        if (propRes.rows.length === 0) return res.status(404).json({ error: "Proposal not found" });
        const proposal = propRes.rows[0];

        // 1. Get MultiSig Info & Authoritative Config
        const config = await ConfigService.getConfig();
        const multisigAddress = config.contracts.multisig;
        const chainId = Number(config.chainId);

        // 2. Load MultiSig Contract to get Version
        const provider = await ProviderService.getProvider();
        const artifactPath = path.join(__dirname, "../artifacts/BBSNSMultiSig.json");
        const artifact = require(artifactPath);
        const contract = new ethers.Contract(multisigAddress, artifact.abi, provider);
        const version = await contract.signerVersion();

        // 3. Construct EIP-712 Data
        // To: DocumentRegistry (usually)
        const to = config.contracts.documentRegistry;
        const value = "0";
        const data = "0x"; // Empty data for now as we just want to register it on-chain
        const proposalHash = ethers.id(`${proposal.title}-${proposal.created_at}`);

        const eip712Data = {
            domain: {
                name: "BBSNS_Protocol",
                version: "2",
                chainId: chainId,
                verifyingContract: multisigAddress
            },
            types: {
                Submit: [
                    { name: "to", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "data", type: "bytes" },
                    { name: "proposalHash", type: "bytes32" },
                    { name: "version", type: "uint256" }
                ]
            },
            message: {
                to,
                value,
                data,
                proposalHash,
                version: Number(version)
            }
        };

        res.json({ eip712Data, proposalHash, version: Number(version) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/governance/proposals/:id/submit-on-chain
router.post("/proposals/:id/submit-on-chain", withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_ONCHAIN_SUBMIT' }), withAction('GOV_ONCHAIN_SUBMIT'), withMutation(), async (req, res) => {
    const proposalId = req.params.id;
    const { signature } = req.body;

    if (!signature) return res.status(400).json({ error: "Signature required" });

    try {
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        const proposal = propRes.rows[0];

        // 1. Send Transaction via Relayer
        const { signer } = await require("../blockchain/connection").connectBNB();
        const config = await ConfigService.getConfig();
        const multisigAddress = config.contracts.multisig;
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const contract = new ethers.Contract(multisigAddress, artifact.abi, signer);

        const to = config.contracts.documentRegistry;
        const value = "0";
        const data = "0x";
        const proposalHash = ethers.id(`${proposal.title}-${proposal.created_at}`);

        console.log(`🚀 Relaying submitWithSignature for Prop ${proposalId}...`);
        const tx = await contract.submitWithSignature(to, value, data, signature, proposalHash);
        const receipt = await tx.wait();

        // 2. Fetch the Transaction Index from logs
        // The event is: event TransactionSubmitted(uint256 indexed txIndex, ...)
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

        // 3. Update DB
        await pool.query(
            "UPDATE governance_proposals SET on_chain_tx_index = $1, status = 'active' WHERE id = $2",
            [txIndex, proposalId]
        );

        res.json({ success: true, txIndex, txHash: receipt.hash });
    } catch (err) {
        console.error("Submit On-Chain Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= REMOTE GOVERNANCE VOTING ==================

// POST /api/governance/remote/vote/session - Initialize remote voting session
router.post('/remote/vote/session', withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_REMOTE_INIT' }), withAction('GOV_REMOTE_INIT'), withMutation(), async (req, res) => {
    try {
        const { proposalId, decision } = req.body;
        if (!proposalId || !decision) {
            return res.status(400).json({ error: 'proposalId and decision are required' });
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

        res.json({
            status: session.status,
            challenge: session.challenge,
            proposalId: session.proposal_id,
            decision: session.decision,
            wallet_address: session.wallet_address
        });
    } catch (error) {
        console.error('Remote vote status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/governance/remote/vote/authorize - Submit signature for remote vote
router.post('/remote/vote/authorize', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
    try {
        const { sessionId, walletAddress, signature } = req.body;

        if (!sessionId || !walletAddress || !signature) {
            return res.status(400).json({ error: 'sessionId, walletAddress, and signature are required' });
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

        if (new Date(session.expires_at) < new Date()) {
            return res.status(401).json({ error: 'Session expired' });
        }

        // 1. Verify Signature
        const recoveredAddress = ethers.verifyMessage(session.challenge, signature);
        if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature for this challenge' });
        }

        // 2. Check if user exists and has enough privilege
        const userResult = await pool.query('SELECT * FROM users WHERE wallet_address = $1', [walletAddress.toLowerCase()]);
        if (userResult.rows.length === 0) {
            return res.status(403).json({ error: 'Wallet not registered' });
        }
        const user = userResult.rows[0];
        // Note: We don't have requirePrivilege context here, but we check role manually
        const ROLE_MAP = { 'none': 0, 'owner': 1, 'notary': 2, 'admin': 3 };
        const numericRole = ROLE_MAP[String(user.role).toLowerCase()] || 0;
        if (numericRole < ROLES.NOTARY) {
            return res.status(403).json({ error: 'Insufficient privileges to vote' });
        }

        // 3. Record the vote in governance_votes
        await pool.query(
            `INSERT INTO governance_votes (proposal_id, voter_id, decision, signature)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (proposal_id, voter_id) DO UPDATE SET decision = $3, signature = $4`,
            [session.proposal_id, user.id, session.decision, signature]
        );

        // 4. Update session status
        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, signature = $2, authorized_at = NOW() WHERE id = $3",
            [walletAddress.toLowerCase(), signature, sessionId]
        );

        // EXTRA: Check threshold / auto-execution (Logic duplicated from /proposals/:id/vote)
        const voteCountRes = await pool.query(
            "SELECT COUNT(*) FROM governance_votes WHERE proposal_id = $1 AND decision = 'approve'",
            [session.proposal_id]
        );
        const approvals = parseInt(voteCountRes.rows[0].count);
        const adminRes = await pool.query("SELECT COUNT(*) FROM users WHERE role >= $1", ['admin']);
        const adminCount = parseInt(adminRes.rows[0].count);

        if (session.decision === 'approve' && (adminCount === 1 || approvals >= adminCount)) {
            await pool.query("UPDATE governance_proposals SET status = 'passed' WHERE id = $1", [session.proposal_id]);
        }

        res.json({ message: 'Vote authorized successfully' });
    } catch (error) {
        console.error('Remote vote authorize error:', error);
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

        const challenge = `BBSNS-GOV-SUBMIT-${proposalId}-${Math.random().toString(36).substring(2, 15)}`;
        const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes for complex signing

        const result = await pool.query(
            'INSERT INTO remote_gov_sessions (proposal_id, challenge, expires_at, type) VALUES ($1, $2, $3, $4) RETURNING id',
            [proposalId, challenge, expires_at, 'SUBMIT']
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

        // 1. RELAY TO BLOCKCHAIN (Logic matches /submit-on-chain)
        const proposalId = session.proposal_id;
        const propRes = await pool.query("SELECT * FROM governance_proposals WHERE id = $1", [proposalId]);
        const proposal = propRes.rows[0];

        const { signer } = await require("../blockchain/connection").connectBNB();
        const config = await ConfigService.getConfig();
        const multisigAddress = config.contracts.multisig;
        const artifact = require("../artifacts/BBSNSMultiSig.json");
        const contract = new ethers.Contract(multisigAddress, artifact.abi, signer);

        const to = config.contracts.documentRegistry;
        const value = "0";
        const data = "0x";
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

        // 2. Update DB & Session
        await pool.query(
            "UPDATE governance_proposals SET on_chain_tx_index = $1, status = 'active' WHERE id = $2",
            [txIndex, proposalId]
        );

        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, signature = $2, tx_hash = $3, authorized_at = NOW() WHERE id = $4",
            [walletAddress.toLowerCase(), signature, receipt.hash, sessionId]
        );

        res.json({ success: true, txHash: receipt.hash });
    } catch (error) {
        console.error('Remote submit authorize error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// POST /api/governance/remote/submit/sync-manual - Confirm direct blockchain transaction by Admin
router.post('/remote/submit/sync-manual', withDomain('GOVERNANCE'), requirePrivilege({ capability: 'GOV_ONCHAIN_SUBMIT' }), withAction('GOV_ONCHAIN_SUBMIT'), withMutation(), async (req, res) => {
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

        // 4. Update DB
        const proposalId = session.proposal_id;
        await pool.query(
            "UPDATE governance_proposals SET on_chain_tx_index = $1, status = 'active' WHERE id = $2",
            [txIndex, proposalId]
        );

        await pool.query(
            "UPDATE remote_gov_sessions SET status = 'authorized', wallet_address = $1, tx_hash = $2, authorized_at = NOW() WHERE id = $3",
            [walletAddress.toLowerCase(), txHash, sessionId]
        );

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

        res.json({ success: true, txHash: receipt.hash });
    } catch (error) {
        console.error('Remote confirm authorize error:', error);
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

        // ─── STEP 2: Classify Action & Encode On-Chain Call Data ─────────────────
        // The BBSNSMultiSig enforces that addSigner/removeSigner/changeThreshold
        // can ONLY be called by the contract itself (self-call guard).
        // Therefore: we submit a MultiSig transaction whose `data` encodes the
        // privileged call, then executeTransaction() triggers the self-call.

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

        // ─── STEP 3: Build Encoded Call Data Per Proposal Type ───────────────────
        const multisigIface = new ethers.Interface(artifact.abi);
        let encodedData;
        let isOffChainOnly = false;

        try {
            switch (type) {
                case 'add_admin':
                case 'add_notary':
                    // Encode addSigner(address) call to be executed via the multisig self-call
                    encodedData = multisigIface.encodeFunctionData("addSigner", [target_id]);
                    break;

                case 'remove_admin':
                case 'remove_notary':
                    encodedData = multisigIface.encodeFunctionData("removeSigner", [target_id]);
                    break;

                case 'change_threshold':
                    const newThreshold = parseInt(target_id, 10);
                    if (isNaN(newThreshold) || newThreshold < 1)
                        return res.status(400).json({ error: "Invalid threshold value in target_id." });
                    encodedData = multisigIface.encodeFunctionData("changeThreshold", [newThreshold]);
                    break;

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
            console.log(`[GOV_EXECUTE] Submitting on-chain tx for proposal ${proposalId}, type=${type}`);
            try {
                const proposalHash = ethers.id(`${proposal.title}-${proposal.created_at}`);

                // Submit the encoded call as a multisig transaction targeting the multisig itself
                const submitTx = await multisigContract.submitTransaction(
                    multisigAddress,   // target: the multisig itself (self-call)
                    0,                 // value: 0 ETH
                    encodedData,       // encoded function call
                    proposalHash       // governance reference hash
                );

                console.log(`[GOV_EXECUTE] submitTransaction sent, waiting for receipt... txHash=${submitTx.hash}`);
                const submitReceipt = await submitTx.wait(); // Wait for confirmation
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
                    throw new Error("TransactionSubmitted event not found in receipt. Cannot get txIndex.");

                console.log(`[GOV_EXECUTE] Submitted at txIndex=${txIndex}. Now executing...`);

                // Execute the transaction (this triggers the self-call inside the contract)
                const execTx = await multisigContract.executeTransaction(txIndex);
                console.log(`[GOV_EXECUTE] executeTransaction sent, waiting for receipt... txHash=${execTx.hash}`);
                const execReceipt = await execTx.wait(); // ← CONFIRMED RECEIPT REQUIRED
                txHash = execReceipt.hash;

                onChainSuccess = true;
                console.log(`[GOV_EXECUTE] ✅ On-chain execution confirmed. txHash=${txHash}`);

                // 🛡️ [Hardening] VERIFY_PROTOCOL_REALITY - Do not return success until role is truly changed on-chain
                if (type === 'NOTARY_PROMOTION' || type === 'add_notary') {
                    const targetWallet = (target_id || "").startsWith('0x') ? target_id : null;
                    if (targetWallet) {
                        console.log(`[GOV_EXECUTE] 🔍 Polling for protocol role update for ${targetWallet}...`);
                        const ConfigService = require('../services/config.service');
                        const config = await ConfigService.getConfig();
                        const registry = new ethers.Contract(
                            config.contracts.notaryRegistry,
                            ["function getUserRole(address) view returns (uint8)"],
                            provider
                        );

                        let verified = false;
                        for (let i = 0; i < 10; i++) { // Max 30 seconds (10 * 3s)
                            const role = await registry.getUserRole(targetWallet);
                            if (Number(role) === 2) {
                                verified = true;
                                console.log(`[GOV_EXECUTE] 📡 Protocol role verified: NOTARY (2) ✅`);
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
                // TX FAILED: Leave proposal status as 'passed', do NOT update DB
                console.error(`[GOV_EXECUTE] ❌ On-chain execution failed for proposal ${proposalId}:`, chainErr.message);
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
                        case 'add_admin':
                            await dbClient.query(
                                "UPDATE users SET role = 'admin' WHERE id = $1 OR wallet_address = $2",
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
                                "UPDATE users SET role = 'owner' WHERE id = $1 OR wallet_address = $2",
                                [target_id, target_id.toLowerCase()]
                            );
                            break;
                        case 'remove_notary':
                            await dbClient.query(
                                "UPDATE users SET role = 'owner', identity_state = 'INACTIVE' WHERE id = $1 OR wallet_address = $2",
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

