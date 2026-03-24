/**
 * Correlation ID Middleware
 * 
 * Ensures every request has a unique trace ID.
 */
const crypto = require('crypto');

const correlationMiddleware = (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    
    // Attach to request and response headers
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    
    next();
};

module.exports = correlationMiddleware;
