const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { requirePrivilege, ROLES, RISK_LEVELS } = require("../middleware/actor");
const ConfigService = require("../services/config.service");
const ProviderService = require("../blockchain/provider-service");

// Middleware to ensure user is loaded
// router.use(loadActor) deprecated for zero-trust compliance

/**
 * GET /api/tokens/balance
 * Returns both NTK and NTKR balances for the authenticated user's wallet.
 */
router.get("/balance", requirePrivilege({ capability: 'TOKEN_READ' }), async (req, res) => {
    const user = req.actor;
    // req.actor.id and req.actor.address are now guaranteed by middleware
    const walletAddress = user.address;

    try {
        const { provider } = await require("../blockchain/connection").connectBNB();
        const config = await ConfigService.getConfig();

        const ntkAddress = config.contracts.ntk;
        const ntkrAddress = config.contracts.ntkr;
        const abi = ["function balanceOf(address) view returns (uint256)"];

        let ntkBalance = "0.0";
        let ntkrBalance = "0.0";
        let bnbBalance = "0.0";

        // Fetch BNB Balance
        try {
            const bnbBalWei = await provider.getBalance(walletAddress);
            bnbBalance = ethers.formatEther(bnbBalWei);
        } catch (e) {
            console.error("BNB Fetch Error:", e.message);
        }

        if (ntkAddress) {
            try {
                const ntkContract = new ethers.Contract(ntkAddress, abi, provider);
                const bal = await ntkContract.balanceOf(walletAddress);
                ntkBalance = ethers.formatUnits(bal, 18);
            } catch (e) { console.error("NTK Fetch Error:", e.message); }
        }

        if (ntkrAddress) {
            try {
                const ntkrContract = new ethers.Contract(ntkrAddress, abi, provider);
                const bal = await ntkrContract.balanceOf(walletAddress);
                ntkrBalance = ethers.formatUnits(bal, 18);
            } catch (e) { console.error("NTKR Fetch Error:", e.message); }
        }

        // Fetch Internal (Database) NTKR Balance
        let internalNtkr = "0.0";
        try {
            const pool = require('../db/index');
            const userRes = await pool.query("SELECT ntkr_balance FROM users WHERE id = $1", [user.id]);
            internalNtkr = userRes.rows[0]?.ntkr_balance || "0.0";
        } catch (e) { console.error("Internal Balance Fetch Error:", e.message); }

        res.json({
            wallet: walletAddress,
            balances: {
                ntk: ntkBalance,
                ntkr: ntkrBalance,
                internalNtkr: internalNtkr,
                bnb: bnbBalance
            },
            contracts: {
                ntk: ntkAddress,
                ntkr: ntkrAddress
            }
        });
    } catch (err) {
        console.error("Token balance fetch failed:", err);
        res.status(500).json({ error: "Failed to fetch on-chain balances" });
    }
});

// GET /api/tokens/onchain/:type/:address
router.get("/onchain/:type/:address", requirePrivilege({ capability: 'TOKEN_READ' }), async (req, res) => {
    const { type, address } = req.params;

    try {
        const config = await ConfigService.getConfig();
        const provider = await ProviderService.getProvider();
        let contractAddress;

        if (type === 'ntk') {
            contractAddress = config.contracts.ntk;
        } else if (type === 'ntkr') {
            contractAddress = config.contracts.ntkr;
        } else {
            return res.status(400).json({ error: "Invalid token type" });
        }

        const abi = ["function balanceOf(address) view returns (uint256)"];
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const bal = await contract.balanceOf(address);

        res.json({ balance: ethers.formatUnits(bal, 18) });
    } catch (err) {
        console.error("On-chain balance fetch failed:", err);
        res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/tokens/deposit
 * Bridge between on-chain NTKR purchase (buyPackage) and internal DB balance.
 * 
 * Verifies:
 *   - Transaction exists and succeeded (receipt.status === 1)
 *   - At least 1 block confirmation
 *   - Exactly one PackagePurchased event from NTKR contract
 *   - Event user matches authenticated wallet (no cross-wallet crediting)
 *   - Event amount > 0
 *   - tx_hash not already processed (UNIQUE constraint + explicit check)
 * 
 * Then atomically:
 *   - Inserts into token_deposits (with block_number for forensics)
 *   - Credits users.ntkr_balance (using FOR UPDATE row lock)
 * 
 * NOTE: DB balance is "prepaid credit", NOT a mirror of on-chain balance.
 */
router.post("/deposit", requirePrivilege({ capability: 'TOKEN_MINT' }), async (req, res) => {
    const user = req.actor;
    // requirePrivilege handles authorization and wallet extraction

    const { txHash } = req.body;
    if (!txHash || typeof txHash !== 'string' || !txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
        return res.status(400).json({ error: "Valid transaction hash (0x-prefixed, 64 hex chars) is required." });
    }

    const pool = require('../db/index');
    const config = await ConfigService.getConfig();
    const ntkrAddress = config.contracts.ntkr;
    if (!ntkrAddress || ntkrAddress === ethers.ZeroAddress) {
        console.error("[DEPOSIT] NTKR_CONTRACT_ADDRESS not configured in SSoT");
        return res.status(500).json({ error: "Token contract not configured on server (SSoT)." });
    }

    // --- 0. PRE-CHECK: Has this tx already been processed? ---
    try {
        const existing = await pool.query("SELECT id FROM token_deposits WHERE tx_hash = $1", [txHash.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: "Transaction already processed. Each purchase can only be deposited once." });
        }
    } catch (e) {
        console.error("[DEPOSIT] Pre-check error:", e.message);
        return res.status(500).json({ error: "Failed to verify transaction status." });
    }

    // --- 1. FETCH RECEIPT FROM CHAIN ---
    let provider;
    let receipt;
    let currentBlock;
    try {
        provider = await ProviderService.getProvider();
        receipt = await provider.getTransactionReceipt(txHash);
    } catch (rpcErr) {
        console.error("[DEPOSIT] RPC error fetching receipt:", rpcErr.message);
        return res.status(502).json({ error: "Failed to reach blockchain RPC. Please try again later." });
    }

    if (!receipt) {
        return res.status(404).json({ error: "Transaction not found on-chain. It may still be pending — wait for confirmation and try again." });
    }

    if (receipt.status !== 1) {
        return res.status(422).json({ error: "Transaction failed on-chain (reverted). Cannot deposit from a failed transaction." });
    }

    // --- 2. BLOCK CONFIRMATION CHECK (≥1 confirmation) ---
    try {
        currentBlock = await provider.getBlockNumber();
    } catch (rpcErr) {
        console.error("[DEPOSIT] RPC error fetching block number:", rpcErr.message);
        return res.status(502).json({ error: "Failed to verify block confirmations. Please try again later." });
    }

    const confirmations = currentBlock - receipt.blockNumber;
    if (confirmations < 1) {
        return res.status(425).json({
            error: "Transaction has 0 confirmations. Please wait for at least 1 block confirmation before depositing.",
            confirmations: confirmations,
            blockNumber: receipt.blockNumber,
            currentBlock: currentBlock
        });
    }

    // --- 3. DECODE & VALIDATE PackagePurchased EVENT ---
    const eventABI = ["event PackagePurchased(address indexed user, uint256 packageId, uint256 amount)"];
    const iface = new ethers.Interface(eventABI);

    const matchingEvents = [];
    for (const log of receipt.logs) {
        // Only process logs from the NTKR contract
        if (log.address.toLowerCase() !== ntkrAddress.toLowerCase()) continue;
        try {
            const parsed = iface.parseLog(log);
            if (parsed && parsed.name === 'PackagePurchased') {
                matchingEvents.push({
                    user: parsed.args.user.toLowerCase(),
                    packageId: Number(parsed.args.packageId),
                    amount: parsed.args.amount // BigInt
                });
            }
        } catch (e) {
            // Not a PackagePurchased event from NTKR contract — skip
        }
    }

    // EXACTLY ONE event rule
    if (matchingEvents.length === 0) {
        return res.status(422).json({ error: "No PackagePurchased event found in this transaction. Only buyPackage() transactions can be deposited." });
    }
    if (matchingEvents.length > 1) {
        return res.status(422).json({ error: "Multiple PackagePurchased events found in this transaction. Multi-event transactions are not supported for deposit." });
    }

    const event = matchingEvents[0];

    // --- 4. WALLET OWNERSHIP CHECK ---
    if (event.user !== user.address.toLowerCase()) {
        return res.status(403).json({ error: "Transaction wallet does not match your authenticated wallet. You can only deposit your own purchases." });
    }

    // --- 5. AMOUNT SANITY CHECK ---
    const ntkrAmount = parseFloat(ethers.formatUnits(event.amount, 18));
    if (ntkrAmount <= 0) {
        return res.status(422).json({ error: "Event amount is zero or negative. Cannot credit zero tokens." });
    }

    // --- 6. ATOMIC DB TRANSACTION ---
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // FOR UPDATE lock on the user row — prevents concurrent balance mutations
        const userRow = await client.query(
            "SELECT id, ntkr_balance FROM users WHERE id = $1 FOR UPDATE",
            [user.id]
        );
        if (userRow.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "User account not found." });
        }

        // Insert deposit record (UNIQUE constraint is the final guard against double-credit)
        try {
            await client.query(
                `INSERT INTO token_deposits (user_id, tx_hash, block_number, package_id, ntkr_amount, wallet_address)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [user.id, txHash.toLowerCase(), receipt.blockNumber, event.packageId, ntkrAmount, user.address.toLowerCase()]
            );
        } catch (insertErr) {
            await client.query('ROLLBACK');
            // Check for unique violation (code 23505)
            if (insertErr.code === '23505') {
                return res.status(409).json({ error: "Transaction already processed. Each purchase can only be deposited once." });
            }
            throw insertErr; // Re-throw unexpected errors
        }

        // Credit the internal balance
        await client.query(
            "UPDATE users SET ntkr_balance = ntkr_balance + $1, updated_at = NOW() WHERE id = $2",
            [ntkrAmount, user.id]
        );

        await client.query('COMMIT');

        // Fetch updated balance for response
        const updatedBalance = await pool.query("SELECT ntkr_balance FROM users WHERE id = $1", [user.id]);

        console.log(`[DEPOSIT] SUCCESS: User ${user.id} deposited ${ntkrAmount} NTKR from tx ${txHash} (block ${receipt.blockNumber}, ${confirmations} confirmations)`);

        res.json({
            success: true,
            deposited: ntkrAmount,
            packageId: event.packageId,
            blockNumber: receipt.blockNumber,
            confirmations: confirmations,
            newBalance: parseFloat(updatedBalance.rows[0].ntkr_balance)
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        console.error("[DEPOSIT] Transaction error:", err);
        res.status(500).json({ error: "Internal error processing deposit. Please try again." });
    } finally {
        client.release();
    }
});


module.exports = router;
