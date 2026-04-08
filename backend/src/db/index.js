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

// 🛡️ [DATABASE_PROXY] Transparent Delegation to Internal Pool
const dbProxy = new Proxy({}, {
    get: (target, prop) => {
        if (prop === 'init') return init;
        if (prop === 'getPool') return () => pool;
        if (prop === 'end') return () => pool ? pool.end() : Promise.resolve();
        
        // Throw if called before initialization
        if (!pool) {
            console.error(`❌ [DATABASE_FATAL] Resource [${String(prop)}] accessed before DB initialization.`);
            throw new Error(`DATABASE_NOT_INITIALIZED: Attempted to access property '${String(prop)}' before boot sequence.`);
        }

        // Delegate to the actual PG Pool instance
        const val = pool[prop];
        return typeof val === 'function' ? val.bind(pool) : val;
    }
});

module.exports = dbProxy;
