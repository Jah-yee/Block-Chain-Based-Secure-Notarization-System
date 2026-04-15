const pool = require("../db/index");

/**
 * Nonce Manager
 * 
 * Ensures that the Relayer always uses the correct sequential nonce,
 * even with simultaneous requests or server restarts.
 * Uses the 'relayer_nonces' table for persistence.
 */
class NonceManager {
    constructor(signer) {
        this.signer = signer;
        this.address = null;
        this.lock = false;
    }

    async getNonce() {
        if (!this.address) {
            this.address = await this.signer.getAddress();
        }

        // 1. Fetch from DB with Row-Level Lock
        const res = await pool.query(
            "SELECT nonce FROM relayer_nonces WHERE wallet_address = $1 FOR UPDATE",
            [this.address]
        );

        let nonce;
        if (res.rows.length === 0) {
            // First time: fetch from node
            nonce = await this.signer.provider.getTransactionCount(this.address, "pending");
            await pool.query(
                "INSERT INTO relayer_nonces (wallet_address, nonce) VALUES ($1, $2)",
                [this.address, nonce]
            );
        } else {
            nonce = parseInt(res.rows[0].nonce);
            // Verify against node to prevent being stuck too far behind
            const nodeNonce = await this.signer.provider.getTransactionCount(this.address, "latest");
            if (nodeNonce > nonce) {
                console.warn(`⚠️ DB Nonce (${nonce}) is behind Node Nonce (${nodeNonce}). Syncing...`);
                nonce = nodeNonce;
            }
        }

        return nonce;
    }

    async incrementNonce() {
        await pool.query(
            "UPDATE relayer_nonces SET nonce = nonce + 1, updated_at = NOW() WHERE wallet_address = $1",
            [this.address]
        );
    }

    async syncNonceWithNode() {
        const nodeNonce = await this.signer.provider.getTransactionCount(this.address, "pending");
        await pool.query(
            "UPDATE relayer_nonces SET nonce = $1, updated_at = NOW() WHERE wallet_address = $1",
            [nodeNonce, this.address]
        );
        return nodeNonce;
    }
}

module.exports = NonceManager;
