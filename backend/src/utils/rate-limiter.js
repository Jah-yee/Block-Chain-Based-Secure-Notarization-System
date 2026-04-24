const pool = require('../db/index');

/**
 * Distributed Rate Limiter (Postgres-Backed)
 * 
 * Provides horizontally scalable rate limiting with escalation logic.
 * 
 * @param {number} limit - Max requests allowed in window
 * @param {number} windowMs - Window size in milliseconds
 */
const distributedRateLimiter = (limit, windowMs) => {
    return async (req, res, next) => {
        // 🛡️ [SAFETY] Guard against undefined body (e.g. GET requests)
        const wallet = (req.body && (req.body.wallet_address || req.body.walletAddress)) || req.query.wallet || 'anon';
        const key = `${req.ip}-${wallet}-${req.path}`;
        const now = new Date();

        try {
            // Atomic Upsert + Logic in SQL to prevent race conditions
            const query = `
                INSERT INTO rate_limits (key, count, reset_at, violations, updated_at)
                VALUES ($1, 1, $2, 0, $3)
                ON CONFLICT (key) DO UPDATE SET
                    count = CASE 
                        WHEN EXCLUDED.updated_at > rate_limits.reset_at THEN 1 
                        ELSE rate_limits.count + 1 
                    END,
                    reset_at = CASE 
                        WHEN EXCLUDED.updated_at > rate_limits.reset_at THEN 
                            EXCLUDED.updated_at + (INTERVAL '1 millisecond' * $4 * (1 + LEAST(rate_limits.violations, 5)))
                        ELSE rate_limits.reset_at 
                    END,
                    violations = CASE 
                        WHEN (CASE WHEN EXCLUDED.updated_at > rate_limits.reset_at THEN 1 ELSE rate_limits.count + 1 END) > $5 THEN rate_limits.violations + 1
                        ELSE rate_limits.violations
                    END,
                    updated_at = EXCLUDED.updated_at
                RETURNING count, reset_at, violations;
            `;

            // Note: $2 is the default reset_at for NEW rows (now + windowMs)
            const defaultResetAt = new Date(now.getTime() + windowMs);
            const resData = await pool.query(query, [key, defaultResetAt, now, windowMs, limit]);
            const { count, reset_at, violations } = resData.rows[0];

            if (count > limit) {
                console.warn(`[SECURITY] Distributed Rate limit exceeded | key=${key} | ip=${req.ip} | violations=${violations}`);
                return res.status(429).json({
                    error: 'Too many requests.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    state: 'RATE_LIMITED',
                    retryAfter: Math.ceil((new Date(reset_at) - now) / 1000)
                });
            }

            next();
        } catch (err) {
            console.error('[RATE_LIMITER_ERROR]', err.message);
            // Fail open in case of DB error (optional: fail closed depending on criticality)
            next();
        }
    };
};

module.exports = distributedRateLimiter;
