const circuitBreaker = require("../blockchain/circuit-breaker-state");

/**
 * Circuit Breaker Middleware
 * 
 * Returns 503 Service Unavailable if the smart contract is paused,
 * preventing 'broken' responses during maintenance.
 */
const requireUnpaused = (req, res, next) => {
    if (circuitBreaker.getStatus()) {
        return res.status(503).json({
            status: "maintenance",
            message: "The system is currently undergoing scheduled maintenance or emergency intervention.",
            details: "The underlying smart contract is paused by governance. Please try again soon."
        });
    }
    next();
};

module.exports = { requireUnpaused };
