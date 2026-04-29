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
        const result = await pool.query(
            `INSERT INTO governance_proposals (title, description, type, target_id, target_notaries, proposer_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [title, description, type, target_id, JSON.stringify(target_notaries || []), req.actor.id, expires_at]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
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
router.get('/remote/vote/status/:sessionId', allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_INIT' }), async (req, res) => {
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
router.post('/remote/vote/authorize', withDomain('GOVERNANCE'), allowPublic, requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE' }), withAction('GOV_REMOTE_AUTHORIZE'), withMutation(), async (req, res) => {
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

module.exports = router;
