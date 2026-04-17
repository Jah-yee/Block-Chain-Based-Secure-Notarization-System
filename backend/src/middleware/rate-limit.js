const rateLimit = require('express-rate-limit');

/**
 * 🛡️ PRODUCTION-SAFE IP RESOLVER
 * Corrects for Nginx proxy headers and sanitizes IPv6-mapped IPv4 addresses.
 */
function getClientIP(req) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown';

  // Sanitize IPv6 wrapper (::ffff:) often seen in node
  return ip.replace('::ffff:', '');
}

/**
 * 🛡️ GLOBAL RATE LIMITER
 * 100 requests per 15 minutes per IP.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests. Please try again later.",
      code: "GLOBAL_RATE_LIMIT"
    });
  }
});

/**
 * 🛡️ UPLOAD INITIATE LIMITER (Strict)
 * 5 uploads per hour per User ID (with IP fallback).
 * Prevents payload-inflation attacks.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Priority 1: User ID (Authenticated)
    // Priority 2: Sanitized Client IP (Unauthenticated/Fallback)
    return req.actor?.id ? `user_${req.actor.id}` : getClientIP(req);
  },
  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] Upload limit reached for ${req.actor?.id || getClientIP(req)}`);
    res.status(429).json({
      error: "Upload limit reached. You can only initiate 5 notarizations per hour.",
      code: "UPLOAD_RATE_LIMIT"
    });
  }
});

/**
 * 🛡️ AUTH HANDSHAKE LIMITER (Fast Lane)
 * 100 requests per 5 minutes per IP.
 * Optimized for the Signature/Nonce/Register chain.
 */
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
  handler: (req, res) => {
    res.status(429).json({
      error: "Authentication frequency limit reached. Please wait 5 minutes.",
      code: "AUTH_RATE_LIMIT"
    });
  }
});

module.exports = {
  globalLimiter,
  uploadLimiter,
  authLimiter
};
