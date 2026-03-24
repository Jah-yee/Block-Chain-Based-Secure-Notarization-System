const { connectBNB } = require("./connection");

/**
 * CircuitBreakerState
 * 
 * Manages the in-memory cache of the contract's 'Paused' status
 * by subscribing to blockchain events for near-instant updates.
 */
class CircuitBreakerState {
    constructor() {
        this.isPaused = false;
        this.retryCount = 0;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            const { contract } = await connectBNB();

            // 1. Initial Check
            // We use the 'paused()' view function from OpenZeppelin Pausable
            // Note: Our connection.js ABI needs to include this
            try {
                this.isPaused = await contract.paused();
            } catch (e) {
                console.warn("⚠️ Contract does not support paused() or not yet deployed. Defaulting to unpaused.");
                this.isPaused = false;
            }

            console.log(`🛡️ Circuit Breaker Initialized. Status: ${this.isPaused ? 'PAUSED' : 'ACTIVE'}`);

            // 2. Poll for Status Changes (Replaces fragile event filters)
            setInterval(async () => {
                try {
                    const currentStatus = await contract.paused();
                    if (this.isPaused !== currentStatus) {
                        this.isPaused = currentStatus;
                        if (currentStatus) {
                            console.warn(`🚨 CIRCUIT BREAKER TRIPPED (Detected via polling)`);
                        } else {
                            console.log(`✅ CIRCUIT BREAKER RESET (Detected via polling)`);
                        }
                    }
                } catch (pollErr) {
                    // Ignore transient network errors during polling
                }
            }, 30000);

            this.initialized = true;
        } catch (err) {
            console.error("❌ Failed to initialize Circuit Breaker State:", err.message);
            // Fallback: try again in 30 seconds
            setTimeout(() => this.init(), 30000);
        }
    }

    getStatus() {
        return this.isPaused;
    }
}

// Singleton instance
module.exports = new CircuitBreakerState();
