const pkg = require('pg');
const { Pool } = pkg;

let pool = null;

/**
 * 🛡️ DB_INIT (PHASE 2 - HARDENED BOOT)
 * Responsibility: Manual, one-time initialization of the database pool.
 * Constraint: MUST ONLY BE CALLED AFTER SecretService.loadSecrets().
 */
const init = () => {
    if (pool) return pool; // Single-flight protection

    if (!process.env.DATABASE_URL) {
        console.error("❌ [DATABASE_FATAL] DATABASE_URL is missing after vault handshake.");
        process.exit(1);
    }

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 100, // High capacity for stress testing
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });

    // Handle background pool errors
    pool.on('error', (err) => {
        console.error('⚠️ [DATABASE_WARN] Unexpected error on idle client:', err.message);
    });

    return pool;
};

// Export Proxy to maintain compatibility without global refactor of every 'pool.query' call
module.exports = {
    init,
    query: (...args) => {
        if (!pool) {
            throw new Error("❌ [DATABASE_FATAL] Attempted to query before DB initialization.");
        }
        return pool.query(...args);
    },
    // Expose direct pool for 'pool.connect()' usage
    getPool: () => {
        if (!pool) throw new Error("❌ [DATABASE_FATAL] DB Pool not initialized.");
        return pool;
    },
    end: () => pool ? pool.end() : Promise.resolve()
};
