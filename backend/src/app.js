const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pool = require("./db/index.js");

const correlationMiddleware = require('./middleware/correlation');

const app = express();

// --- PHASE 7: OBSERVABILITY (CORRELATION) ---
app.use(correlationMiddleware);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- HARDENED CORS CONFIG (PHASE 4) ---
app.use(cookieParser());
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(o => o);

// Add default local/dev and enterprise production origins if not explicitly restricted
if (process.env.NODE_ENV !== 'production' || corsOrigins.length === 0) {
  corsOrigins.push(
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://localhost:3002',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3002',
    'http://13.233.236.240:3000',
    'http://13.233.236.240:5000',
    'https://app.bbsns.xyz',
    'https://auth.bbsns.xyz',
    'https://bbsns.xyz'
  );
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

// Mount API router
app.use('/api', apiRouter);

// Mount Legacy Routes at root for backward compatibility
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/documents', documentRoutes);
app.use('/transactions', transactionRoutes);
app.use('/governance', governanceRoutes);
app.use('/tokens', tokensRoutes);
app.use('/notaries', notaryRoutes);
app.use('/system', systemRoutes);

// Special Legacy Aliases (Now handled by sub-routers where possible)
const { requirePrivilege, allowPublic, ROLES, RISK_LEVELS } = require('../middleware/actor');

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

// Phase 4: Start Reputation Background Worker
const { startReputationWorker } = require('./workers/reputation-worker');
startReputationWorker();

module.exports = app;
