const pkg = require('pg');
const { Pool } = pkg;

let pool = null;

const { ACTOR_IDS } = require('../constants/protocol');
const { ACTION_POLICIES } = require('../constants/actions');

// 🛡️ [RECURSION_GUARD] Unique symbol to prevent proxy inception
const IS_SENTINEL_PROXIED = Symbol('IS_SENTINEL_PROXIED');

/**
 * 🛡️ BBSNSEnforcementError (PHASE FINAL)
 */
class BBSNSEnforcementError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'BBSNSEnforcementError';
        this.status = 403;
        this.context = context;
    }
}

const STRICT_DOMAINS = ['AUTH', 'DOCS', 'USERS'];

/**
 * 🛡️ DB_INIT (PHASE 2 - HARDENED BOOT)
 */
const init = () => {
    if (pool) return pool;

    if (!process.env.DATABASE_URL) {
        console.error("❌ [DATABASE_FATAL] DATABASE_URL is missing after vault handshake.");
        process.exit(1);
    }

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 100,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
        console.error('⚠️ [DATABASE_WARN] Unexpected error on idle client:', err.message);
    });

    return pool;
};

const dbContext = require('./context');

// 🛡️ [UTILITY] SQL Extraction & Sanitization
function extractSql(queryArg) {
    if (!queryArg) return null;
    if (typeof queryArg === 'string') return queryArg;
    if (typeof queryArg === 'object' && queryArg.text) return queryArg.text;
    return null;
}

function isTransactionControl(sql) {
    if (!sql || typeof sql !== 'string') return false;
    // Normalize string for consistent regex matching
    const normalized = sql.trim().toUpperCase();
    return /^\s*(BEGIN|COMMIT|ROLLBACK|ABORT|SAVEPOINT|RELEASE|START TRANSACTION|END|START)\b/i.test(normalized);
}

function maskSqlContext(sql) {
    if (!sql || typeof sql !== 'string') return '';
    return sql
        .replace(/E'(?:\\'|''|[^'])*'/g, "'_E_'")
        .replace(/'(?:''|[^'])*'/g, "'_S_'")
        .replace(/"(?:""|[^"])*"/g, '"_I_"');
}

function stripComments(sql) {
    if (!sql || typeof sql !== 'string') return '';
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--.*$/gm, '');
}

function prepareDetectionSql(sql) {
    let text = (sql || '').trim().toUpperCase();
    text = stripComments(text);
    text = maskSqlContext(text);
    return text.replace(/\s+/g, ' ').trim();
}

function extractAllTargetTables(preparedSql) {
    const tableSet = new Set();
    const tablePatterns = [
        /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|FROM|JOIN)\s+["']?([\w.]+)/ig
    ];

    for (const pattern of tablePatterns) {
        let match;
        while ((match = pattern.exec(preparedSql)) !== null) {
            const tablePath = match[1];
            if (tablePath) {
                const parts = tablePath.split('.');
                const tableName = parts[parts.length - 1].toUpperCase();
                if (!['SELECT', 'SET', 'VALUES', 'WHERE', 'JOIN', 'AS', 'ON', 'WITH'].includes(tableName)) {
                    tableSet.add(tableName);
                }
            }
        }
    }
    return Array.from(tableSet);
}

function detectMutation(preparedSql) {
    const MUTATION_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ALTER', 'DROP', 'CREATE'];
    const mutationRegex = new RegExp(`\\b(${MUTATION_KEYWORDS.join('|')})\\b`, 'i');
    return mutationRegex.test(preparedSql);
}

function detectPrimaryOp(preparedSql) {
    const DML_KEYWORDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ALTER', 'DROP', 'CREATE'];
    const matches = [];
    
    for (const kw of DML_KEYWORDS) {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        let match;
        while ((match = regex.exec(preparedSql)) !== null) {
            matches.push({ keyword: kw, index: match.index });
        }
    }

    if (matches.length === 0) return 'UNKNOWN';
    matches.sort((a, b) => b.index - a.index);
    return matches[0].keyword;
}

function classifyQuery(preparedSql, tables) {
    const isMut = detectMutation(preparedSql);
    if (!isMut) return 'READ_ONLY';
    if (preparedSql.includes('WITH')) return 'COMPLEX_CTE';
    if (preparedSql.includes('JOIN')) return 'COMPLEX_JOIN';
    if (tables.length >= 2) return 'MULTI_TABLE';
    return 'SIMPLE_MUTATION';
}

/**
 * 🛡️ executeAuditedQuery (SENTINEL_2.0_CORE)
 * Centralized query analyzer for both direct pool.query and recursively wrapped client.query calls.
 */
async function executeAuditedQuery(target, originalMethod, ...args) {
    const store = dbContext.getStore();
    
    // 🛡️ [FAIL_CLOSED] Mandatory Context Guard with Deep Forensics
    if (!store) {
        const errStack = new Error().stack;
        console.error("❌ [CTX_LOST] Database context missing mid-request.", { method: originalMethod.name, stack: errStack });
        throw new BBSNSEnforcementError("STRUCTURAL_ERROR: Database context missing");
    }

    const queryArg = args[0];
    const sql = extractSql(queryArg);

    // 🛡️ [TRANSACTION_PASS] Allow FSM control commands without inspection
    if (isTransactionControl(sql)) {
        return originalMethod.apply(target, args);
    }

    const preparedSql = prepareDetectionSql(sql);
    const mutationTables = extractAllTargetTables(preparedSql);
    const isMutation = detectMutation(preparedSql);
    const op = detectPrimaryOp(preparedSql);
    const classification = classifyQuery(preparedSql, mutationTables);
    
    const domain = store.domain || 'UNCATEGORIZED';
    const action = store.action;
    const actorId = store.userId;
    const isStrict = STRICT_DOMAINS.includes(domain);
    const ENFORCEMENT_MODE = process.env.ENFORCEMENT_MODE || 'soft';

    const logContext = {
        reqId: store.requestId || 'SYSTEM',
        route: store.route || 'INTERNAL',
        domain,
        mode: isStrict ? 'STRICT' : 'SAFE',
        actor: actorId || 'GUEST',
        action: action || 'NONE',
        classification,
        tables: mutationTables.join(','),
        op
    };

    const writeEnforcementLog = (result, reason) => {
        const logPrefix = result === 'BLOCKED' ? '❌' : (result === 'WARNING' ? '⚠️' : '✅');
        console.log(`${logPrefix} [ENFORCEMENT_DECISION] domain=${domain} mode=${logContext.mode} action=${logContext.action} result=${result} reason="${reason}" tables=[${logContext.tables}] reqId=${logContext.reqId}`);
    };

    // 🔍 [ENFORCEMENT] Root System Actor Protection
    // Ensures userId:0 (SYSTEM) is only used from recognized internal contexts.
    if (actorId === ACTOR_IDS.SYSTEM) {
        if (store.contextType !== 'SYSTEM' && store.route !== 'INTERNAL_SERVICE') {
            const reason = 'SECURITY_VIOLATION: Unauthorized attempt to use SYSTEM actor from an external boundary.';
            writeEnforcementLog('BLOCKED', reason);
            throw new BBSNSEnforcementError(reason, logContext);
        }
    }

    if (isMutation && mutationTables.length === 0) {
        const reason = 'UNKNOWN_MUTATION_TARGET: Ambiguous SQL target detected.';
        writeEnforcementLog(isStrict ? 'BLOCKED' : 'WARNING', reason);
        if (isStrict && ENFORCEMENT_MODE === 'hard') {
            throw new BBSNSEnforcementError(reason, logContext);
        }
    }

    // POLICY CHECK
    if (actorId === ACTOR_IDS.SYSTEM) {
        if (isMutation) writeEnforcementLog('ALLOWED', 'SYSTEM_INTENT_AUTHORIZED');
    } else if (action && ACTION_POLICIES[action]) {
        const policy = ACTION_POLICIES[action];
        const unauthorizedTables = mutationTables.filter(table => {
            return !policy.rules.some(r => r.table === table && (r.op === op || (r.op === 'INSERT' && op === 'INSERT' && r.optional)));
        });

        if (unauthorizedTables.length > 0) {
            const reason = `POLICY_VIOLATION: ${op} on [${unauthorizedTables.join(',')}] not permitted for ${action}.`;
            if (isMutation) {
                writeEnforcementLog(isStrict ? 'BLOCKED' : 'WARNING', reason);
                if (isStrict && ENFORCEMENT_MODE === 'hard') throw new BBSNSEnforcementError(reason, logContext);
            } else {
                writeEnforcementLog('WARNING', reason);
            }
        } else if (isMutation) {
            writeEnforcementLog('ALLOWED', 'POLICY_SATISFIED');
        }
    } else if (isMutation) {
        const reason = action ? 'ACTION_POLICY_UNKNOWN' : 'ACTION_REQUIRED: Mutations forbidden without explicit action.';
        writeEnforcementLog(isStrict ? 'BLOCKED' : 'WARNING', reason);
        if (isStrict && ENFORCEMENT_MODE === 'hard') throw new BBSNSEnforcementError(reason, logContext);
    }

    // TRANSIT CHANNEL (Identity Required for Mutations)
    if (isMutation) {
        if (!store || (!store.actorId && !store.userId)) {
            const reason = 'SENTINEL_BLOCK_MISSING_ACTOR_CONTEXT: Mutation requires authenticated actor context.';
            writeEnforcementLog('BLOCKED', reason);
            throw new BBSNSEnforcementError(reason, logContext);
        }
    }

    return originalMethod.apply(target, args);
}

/**
 * 🛡️ wrapClientWithSentinel (SENTINEL_2.0_RECURSION)
 * Wraps a pg.Client to ensure .query() calls are intercepted.
 */
function wrapClientWithSentinel(client) {
    if (!client || client[IS_SENTINEL_PROXIED]) return client;

    const queryProxy = new Proxy(client.query, {
        apply: (target, thisArg, args) => executeAuditedQuery(client, target, ...args)
    });

    return new Proxy(client, {
        get: (target, prop) => {
            if (prop === IS_SENTINEL_PROXIED) return true;
            if (prop === 'query') return queryProxy;
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        }
    });
}

async function runWithContext({ userId, reason, route, requestId, service, contextType = 'REQUEST' }, fn) {
    const store = dbContext.getStore();
    if (!store) throw new BBSNSEnforcementError("STRUCTURAL_ERROR: Root context missing");

    if (!pool) pool = init();
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.user_id', $1::text, true)", [String(userId)]);
        await client.query("SELECT set_config('app.reason', $1::text, true)", [reason]);

        store.auditClient = wrapClientWithSentinel(client);
        store.userId = userId;
        store.contextType = contextType; 
        store.reason = reason;
        store.route = route || (contextType === 'SYSTEM' ? 'INTERNAL_SERVICE' : 'WEB_ROUTE');
        store.requestId = requestId;
        store.service = service;

        return await fn(store.auditClient);
    } finally {
        client.release();
        store.auditClient = null;
    }
}

// 🛡️ [DATABASE_PROXY] (SENTINEL_2.0_PERIMETER)
const dbProxy = new Proxy({}, {
    get: (target, prop) => {
        if (prop === 'init') return init;
        if (prop === 'getPool') return () => pool;
        if (prop === 'runWithContext') return runWithContext;
        if (prop === 'end') return () => pool ? pool.end() : Promise.resolve();
        
        // 1. Connection Acquisition Methods
        if (typeof prop === 'string' && ['connect', 'getClient'].includes(prop)) {
            return async (...args) => {
                const store = dbContext.getStore();
                if (!store) {
                    console.error("❌ [CTX_LOST] pool.connect called without context.");
                    throw new BBSNSEnforcementError("STRUCTURAL_ERROR: Database context missing");
                }
                const rawClient = await pool[prop](...args);
                return wrapClientWithSentinel(rawClient);
            };
        }

        // 2. Direct Pool Query Method
        if (prop === 'query') {
            return async (...args) => executeAuditedQuery(pool, pool.query, ...args);
        }

        if (!pool) return undefined;
        const val = pool[prop];
        return typeof val === 'function' ? val.bind(pool) : val;
    }
});

dbProxy.ACTOR_IDS = ACTOR_IDS;
dbProxy.BBSNSEnforcementError = BBSNSEnforcementError;
module.exports = dbProxy;
