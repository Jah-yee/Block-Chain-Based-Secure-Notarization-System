const pool = require('../db/index.js');
const dbContext = require('../db/context');

/**
 * 🛡️ [SECURITY] Audit Session Middleware (PHASE 1 - TRANSPARENT)
 * Responsibility: Injects mandatory session context (app.user_id, app.reason) 
 * into the Postgres session for all state-modifying requests WITHOUT refactoring controllers.
 */
async function auditSession(req, res, next) {
    // 🛡️ [RESILIENCE] Pattern-based bypass for authentication handshakes
    // Covers both legacy root (/auth/...) and modern (/api/auth/...) routes.
    const isAuthHandshake = req.path.startsWith('/auth/') || req.path.startsWith('/api/auth/');
    
    if (isAuthHandshake) {
        return next(); // 🚀 [BYPASS] Auth handshakes manage their own context or are public.
    }

    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    
    if (!isMutation) return next();

    const userId = req.actor?.id || 0; 
    const reason = `${req.method} ${req.originalUrl}`;

    let client;
    try {
        client = await pool.connect();
        
        // 🛡️ Setup Session Variables
        await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
        await client.query("SELECT set_config('app.reason', $2, true)", [reason]);

        // Cleanup Handler
        const cleanup = () => {
            if (client) {
                client.release();
                client = null;
            }
        };
        res.on('finish', cleanup);
        res.on('close', cleanup);

        // 🔗 Run next handlers inside the context
        dbContext.run({ auditClient: client }, () => {
            next();
        });

    } catch (err) {
        if (client) client.release();
        console.error('[AUDIT_SESSION_ERROR] Failed to initialize Postgres context:', err.message);
        res.status(500).json({ 
            error: 'Security Initialization Failed', 
            detail: 'Could not establish audit context.' 
        });
    }
}

module.exports = auditSession;
