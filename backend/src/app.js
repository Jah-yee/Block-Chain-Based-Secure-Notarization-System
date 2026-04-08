const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pool = require("./db/index.js");
const ConfigService = require("./services/config.service");
const correlationMiddleware = require('./middleware/correlation');

const app = express();

// 🛡️ [SECURITY] Trust Proxy (Required for rate limiting behind Nginx)
app.set('trust proxy', 1);

// ✅ Health Check Route (Standard & API prefixed)
// Defined early to avoid middleware/router interference
// allowPublic must be imported from middleware/actor
const { allowPublic, requirePrivilege, ROLES, RISK_LEVELS } = require('./middleware/actor');
const { globalLimiter } = require('./middleware/rate-limit');

app.get("/health", allowPublic, async (req, res) => {
    let dbStatus = 'UNAVAILABLE';
    let rpcStatus = 'UNAVAILABLE';
    let configStatus = 'MALFORMED';

    try {
        await pool.query('SELECT 1');
        dbStatus = 'OK';
    } catch (e) {}

    try {
        const config = await ConfigService.getConfig();
        configStatus = 'OK';
        const { ethers } = require('ethers');
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        await provider.getBlockNumber();
        rpcStatus = 'OK';
    } catch (e) {}

    const isStable = dbStatus === 'OK' && rpcStatus === 'OK' && configStatus === 'OK';
    
    res.status(isStable ? 200 : 503).json({
        status: isStable ? "STABLE" : "DEGRADED",
        timestamp: new Date().toISOString(),
        checks: {
            database: dbStatus,
            blockchain_rpc: rpcStatus,
            system_config: configStatus
        },
        environment: process.env.NODE_ENV || "development",
        version: "1.3.0-hardened"
    });
});

// --- PHASE 7: OBSERVABILITY (CORRELATION) ---
app.use(correlationMiddleware);

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// --- HARDENED CORS CONFIG (PHASE 4) ---
app.use(cookieParser());

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(o => o);

// Add authoritative production domain fallbacks
if (process.env.NODE_ENV === 'production' || corsOrigins.length === 0) {
  corsOrigins.push('https://app.bbsns.online', 'https://api.bbsns.online');
}

// Add local development origins if not in production or if explicitly requested
if (process.env.NODE_ENV !== 'production') {
  corsOrigins.push(
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://localhost:3002',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3002'
  );

  // Add Dynamic Production Origins from Environment (only in dev/test to avoid production clutter)
  if (process.env.WEB_APP_URL) corsOrigins.push(process.env.WEB_APP_URL);
  if (process.env.REMOTE_AUTH_URL) corsOrigins.push(process.env.REMOTE_AUTH_URL);
  if (process.env.ADMIN_PORTAL_URL) corsOrigins.push(process.env.ADMIN_PORTAL_URL);
}


app.use(cors({
	origin: corsOrigins,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Actor-Id']
}));

// Route Definitions
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const documentRoutes = require('./routes/documents');
const transactionRoutes = require('./routes/transactions');
const governanceRoutes = require('./routes/governance');
const tokensRoutes = require('./routes/tokens');
const notaryRoutes = require('./routes/notaries');
const systemRoutes = require('./routes/system');
const disputeRoutes = require('./routes/disputes');

// Create an API router for /api prefixed routes
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/documents', documentRoutes);
apiRouter.use('/transactions', transactionRoutes);
apiRouter.use('/governance', governanceRoutes);
apiRouter.use('/tokens', tokensRoutes);
apiRouter.use('/notaries', notaryRoutes);
apiRouter.use('/system', systemRoutes);
apiRouter.use('/disputes', disputeRoutes);

// Mount API router with Global Rate Limiting
app.use('/api', globalLimiter, apiRouter);

// Mount Legacy Routes at root
app.use('/auth', globalLimiter, authRoutes);
app.use('/users', globalLimiter, userRoutes);
app.use('/documents', globalLimiter, documentRoutes);
app.use('/transactions', globalLimiter, transactionRoutes);
app.use('/governance', globalLimiter, governanceRoutes);
app.use('/tokens', globalLimiter, tokensRoutes);
app.use('/notaries', globalLimiter, notaryRoutes);
app.use('/system', globalLimiter, systemRoutes);

// Special Legacy Aliases (Now handled by sub-routers where possible)
// (Imports moved to top for health check)

// Desktop App Compatibility Alias
app.get('/me', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), (req, res) => {
	// Forward to the auth router handler logic (can't easily reuse router middleware here without refactoring)
	// Alternatively, just mount authRoutes at root but that's messy.
	// Let's just define it here briefly as a proxy.
	res.redirect(307, '/api/auth/me');
});

// ✅ Test route to check DB connection
app.get("/", allowPublic, async (req, res) => {
	try {
		const result = await pool.query("SELECT NOW()");
		res.json({
			status: "online",
			serverTime: result.rows[0].now
		});
	} catch (err) {
		console.error("❌ Query error:", err);
		res.status(500).json({ error: err.message });
	}
});

// Phase 4: Start Reputation Background Worker (Suppress during tests)
if (process.env.NODE_ENV !== 'test') {
    const { startReputationWorker } = require('./workers/reputation-worker');
    startReputationWorker();
}

module.exports = app;

// 🛡️ Global Error Handler
app.use((err, req, res, next) => {
    // Handle Multer File Size Limits
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: 'File too large',
            message: 'The uploaded file exceeds the maximum allowed size for this endpoint.',
            code: 'LIMIT_FILE_SIZE'
        });
    }

    console.error('[GLOBAL_ERROR]', err);
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
});

