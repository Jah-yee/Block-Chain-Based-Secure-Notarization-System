const { AsyncLocalStorage } = require('async_hooks');

/**
 * 🛡️ [SECURITY] Database Request Context
 * Uses AsyncLocalStorage to persist request-scoped database clients 
 * across asynchronous execution boundaries.
 */
const dbContext = new AsyncLocalStorage();

module.exports = dbContext;
