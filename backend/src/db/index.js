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

const dbContext = require('./context');

// 🛡️ [UTILITY] Iron Sentinel: Non-bypassable Mutation Detector
function detectMutation(query) {
    if (!query) return false;
    const sql = (typeof query === 'string' ? query : (query.text || '')).trim().toUpperCase();

    // 1. Mandatory Multi-Statement Ban (Prevents silent bypass)
    if (sql.includes(';')) {
        throw new Error('MANDATORY_AUDIT_VIOLATION: Multi-statement queries are forbidden in BBSNS for security isolation.');
    }

    // 2. Mutation Intent Detection
    const MUTATION_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ALTER', 'DROP', 'CREATE'];
    return MUTATION_KEYWORDS.some(keyword => sql.startsWith(keyword));
}

/**
 * 🛡️ [SECURITY] Re-Entrant Context Helper
 * Responsibility: Establishes a Postgres session context with app.user_id and app.reason.
 * Safety: Reuses existing context if present to prevent connection leaks / overrides.
 */
async function runWithContext({ userId, reason }, fn) {
    const existingStore = dbContext.getStore();
    if (existingStore) {
        // [Safety] Already inside a context. Execute directly.
        return await fn();
    }

    const client = await pool.connect();
    try {
        // Enforce Session State
        await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
        await client.query("SELECT set_config('app.reason', $2, true)", [reason]);

        // Execute function inside AsyncLocalStorage context
        return await dbContext.run({ auditClient: client, userId, reason }, fn);
    } finally {
        client.release();
    }
}

// 🛡️ [DATABASE_PROXY] Transparent Delegation to Internal Pool or Request-Scoped Client
const dbProxy = new Proxy({}, {
    get: (target, prop) => {
        // Whitelisted Management Methods
        if (prop === 'init') return init;
        if (prop === 'getPool') return () => pool;
        if (prop === 'runWithContext') return runWithContext;
        if (prop === 'end') return () => pool ? pool.end() : Promise.resolve();
        
        const context = dbContext.getStore();
        const activeClient = context?.auditClient;

        // 🛡️ [ENFORCEMENT] The Sentinel Logic
        const interceptedMethod = (prop === 'query' || prop === 'connect' || prop === 'getClient');
        
        if (interceptedMethod) {
            return async function(...args) {
                const query = args[0];
                const isMutation = detectMutation(query);

                // 🚩 FAIL-FAST: Mutations MUST have an audit context
                if (isMutation && !activeClient) {
                    console.error(`[SECURITY] AUDIT BLOCKED | reason=MANDATORY_AUDIT_MISSING | query=${JSON.stringify(query)}`);
                    throw new Error('MANDATORY_AUDIT_ERROR: Attempted to modify database without an active audit context.');
                }

                // If we have a context, use the context's client
                if (activeClient) {
                    return activeClient[prop](...args);
                }

                // Fallback: Bootstrap READ (e.g. SELECT) without context
                if (!pool) throw new Error('DATABASE_NOT_INITIALIZED');
                return pool[prop](...args);
            };
        }

        // Delegate other properties (like pool events) to the raw pool
        if (!pool) return undefined;
        const val = pool[prop];
        return typeof val === 'function' ? val.bind(pool) : val;
    }
});

module.exports = dbProxy;
