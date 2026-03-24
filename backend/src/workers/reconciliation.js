const { Pool } = require('pg');
const { ethers } = require('ethers');
require('dotenv').config({ override: true });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const contractABI = [
    "function getDocument(bytes32 docHash) external view returns (address notary, uint256 timestamp, uint8 status, bool exists)",
    "event DocumentRecorded(bytes32 indexed docHash, address indexed notary, uint8 status, bytes32 summaryHash, bytes32 rejectionReasonHash, uint256 timestamp)"
];

const contractInterface = new ethers.Interface(contractABI);

async function reconcile() {
    console.log(`[RECONCILER] Starting Gated Integrity sync at ${new Date().toISOString()}`);

    try {
        const client = await pool.connect();

        // 1. Fetch documents in flight (submitted but not confirmed)
        const inFlightDocs = await client.query(
            "SELECT id, file_hash, filename, approval_tx_hash, submission_state FROM documents WHERE submission_state = 'submitted_to_blockchain' AND chain_confirmed = false AND is_deleted = false"
        );

        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        // STRICT INVARIANT: No fallback. Must be explicitly configured.
        const contractAddress = process.env.DOCUMENT_REGISTRY_ADDRESS;
        if (!contractAddress) {
            throw new Error("FATAL: DOCUMENT_REGISTRY_ADDRESS is not configured. Reconciler cannot verify on-chain state.");
        }
        const contract = new ethers.Contract(contractAddress, contractABI, provider);

        for (const doc of inFlightDocs.rows) {
            try {
                if (!doc.approval_tx_hash) continue;

                console.log(`[RECONCILER] Verifying tx ${doc.approval_tx_hash} for ${doc.filename}...`);
                const receipt = await provider.getTransactionReceipt(doc.approval_tx_hash);

                if (receipt && receipt.status === 1) {
                    // FULL SEMANTIC VERIFICATION
                    let eventFound = false;
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = contractInterface.parseLog(log);
                            if (parsedLog && parsedLog.name === 'DocumentRecorded') {
                                const onChainHash = parsedLog.args.docHash;
                                const onChainNotary = parsedLog.args.notary.toLowerCase();
                                const dbHash = doc.file_hash.startsWith('0x') ? doc.file_hash : `0x${doc.file_hash}`;

                                if (onChainHash === dbHash) {
                                    eventFound = true;
                                    console.log(`[RECONCILER] Semantic Match Found! Proof from ${onChainNotary} for ${doc.filename}`);

                                    // ATOMIC PROOF INSERTION
                                    await client.query('BEGIN');
                                    // Set Trusted Worker Session Variable (for DB Trigger safety)
                                    await client.query("SET LOCAL app.is_trusted_worker = 'true'");

                                    await client.query(
                                        `INSERT INTO blockchain_receipts (doc_id, tx_hash, signer, doc_hash, contract_address)
                                         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (doc_id) DO NOTHING`,
                                        [doc.id, doc.approval_tx_hash, onChainNotary, dbHash, contractAddress]
                                    );

                                    await client.query(
                                        "UPDATE documents SET chain_confirmed = true, updated_at = NOW() WHERE id = $1",
                                        [doc.id]
                                    );

                                    await client.query('COMMIT');
                                    console.log(`[RECONCILER] Gated Integrity Secured for ${doc.filename}`);
                                    break;
                                }
                            }
                        } catch (e) {
                            // Log might not be from our contract or event, skip
                        }
                    }

                    if (!eventFound) {
                        console.warn(`[RECONCILER] WARNING: Tx ${doc.approval_tx_hash} succeeded but no DocumentRecorded event matches for ${doc.filename}. Potential tx reuse attempt?`);
                    }
                }
            } catch (err) {
                console.error(`[RECONCILER] Error verifying doc ${doc.id}:`, err.message);
                if (client) await client.query('ROLLBACK').catch(() => { });
            }
        }

        // 2. DETECT FALSE CONFIRMATIONS (Adversarial Check)
        // Check documents marked 'chain_confirmed' in DB but lacking Proof table or On-Chain state
        const confirmedDocs = await client.query(
            "SELECT id, file_hash, filename FROM documents WHERE chain_confirmed = true AND is_deleted = false"
        );

        for (const doc of confirmedDocs.rows) {
            try {
                const docHash = doc.file_hash.startsWith('0x') ? doc.file_hash : `0x${doc.file_hash}`;
                const onChainData = await contract.getDocument(docHash);

                // Verify against separate Proof table too
                const proofCheck = await client.query("SELECT 1 FROM blockchain_receipts WHERE doc_id = $1", [doc.id]);

                if (!onChainData.exists || onChainData.status !== 1 || proofCheck.rows.length === 0) {
                    console.error(`[RECONCILER] ALERT: False Confirmation Detected for ${doc.filename} (ID: ${doc.id}). Reverting...`);

                    await client.query('BEGIN');
                    // We don't need app.is_trusted_worker to set false, 
                    // or we might if the trigger blocks any update to confirmed rows.
                    // But here we are intentionally REVERTING a lie.
                    await client.query("SET LOCAL app.is_trusted_worker = 'true'");

                    await client.query(
                        "UPDATE documents SET chain_confirmed = false, submission_state = 'pending', approval_tx_hash = NULL, updated_at = NOW() WHERE id = $1",
                        [doc.id]
                    );
                    await client.query("DELETE FROM blockchain_receipts WHERE doc_id = $1", [doc.id]);
                    await client.query('COMMIT');
                    console.log(`[RECONCILER] Cleaned fraudulent state for ${doc.filename}.`);
                }
            } catch (err) {
                console.error(`[RECONCILER] Error auditing confirmed doc ${doc.id}:`, err.message);
            }
        }

        client.release();
    } catch (err) {
        console.error("[RECONCILER] Critical Error:", err);
    }
}

// Run immediately then every 5 minutes if executed as a standalone script
if (require.main === module) {
    reconcile();
    setInterval(reconcile, 5 * 60 * 1000);
}

module.exports = { reconcile };
