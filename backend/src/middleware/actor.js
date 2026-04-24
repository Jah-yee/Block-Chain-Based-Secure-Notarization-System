const jwt = require('jsonwebtoken');
const pool = require('../db/index.js');
const BBSNSEnforcementError = pool.BBSNSEnforcementError;
const dbContext = require('../db/context');
const ConfigService = require('../services/config.service');

const { ROLES, RISK_LEVELS, ACTOR_IDS } = require('../constants/protocol');
const { ACTION_POLICIES } = require('../constants/actions');

// Zero-Trust Role Normalization
const normalizeRole = (role) => {
  if (typeof role === 'number') return role;
  const ROLE_MAP = { 'none': 0, 'user': 1, 'owner': 1, 'notary': 2, 'admin': 3 };
  const normalized = ROLE_MAP[String(role).toLowerCase()];
  return normalized !== undefined ? normalized : 0;
};

async function loadActor(req, res, next) {
  // 🛡️ [SANITATION] Multi-Layer Token Firewall
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.substring(7);
    
    // Defensive Normalization
    if (rawToken === 'null' || rawToken === 'undefined') {
      console.warn(`[AUTH_SANITIZE] Neutralized invalid token string (Legacy): "${rawToken}" from ${req.originalUrl}`);
      token = null;
    } else if (typeof rawToken !== 'string' || rawToken.length < 20) {
      token = null; 
    } else {
      token = rawToken;
    }
  } else {
    token = req.cookies?.token;
  }

  if (!token) {
    req.actor = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // During transition, we still query DB but warn that it's deprecated
    const r = await pool.query('SELECT id, role, wallet_address FROM users WHERE id=$1', [decoded.id]);
    if (r.rows.length === 0) return next();

    const actor = r.rows[0];
    const snapshotBlock = null; // Bunker 3.6: No fallback to 0. Null = Weak Session.
    actor.role = normalizeRole(actor.role); // Standardize to number
    req.actor = actor;
    next();
  } catch (err) {
    req.actor = null;
    next();
  }
}

function requireRole(roleName) {
  return (req, res, next) => {
    if (!req.actor) return res.status(401).json({ error: 'Authentication required' });
    if (req.actor.role === 'admin' || req.actor.role === roleName) return next();
    return res.status(403).json({ error: 'Insufficient role' });
  };
}

// Middleware to reject update/delete on transactions
function rejectTransactionModification(req, res, next) {
  if (req.method === 'PUT' || req.method === 'DELETE') {
    return res.status(405).json({ error: 'Transactions are immutable' });
  }
  next();
}

// Middleware to restrict document updates after approval
async function restrictDocumentUpdate(req, res, next) {
  if (req.method === 'PUT') {
    try {
      const docId = req.params.id;
      const doc = await pool.query('SELECT status FROM documents WHERE id=$1', [docId]);
      if (doc.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
      if (doc.rows[0].status === 'approved') {
        return res.status(400).json({ error: 'Cannot update approved documents' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }
  next();
}

// Zero-Trust Authority Enforcement Middleware
function requirePrivilege(mwConfig) {
  const { minRole, risk, capability } = mwConfig || {};
  const middleware = async function requirePrivilege(req, res, next) {
    // 🛡️ Fetch Authoritative System Config
    const systemConfig = await ConfigService.getConfig();
    // 🛡️ [RESILIENCE] Late-binding Dependencies (Bunker V3.6.3)
    const ProviderService = require('../blockchain/provider-service');
    const blockCache = require('../utils/block-cache');

    // 1. Authoritative Capability Resolution & Default-Deny
    if (!capability) {
      console.error(`[AUTH_CRITICAL] Route PROTECTED but NO capability declared: ${req.originalUrl}`);
      return res.status(500).json({ error: 'Security Engine Error: Missing Capability Declaration' });
    }

    const actionConfig = ACTION_POLICIES[capability] || { requiresStrong: true };
    const effectiveMinRole = minRole !== undefined ? minRole : (actionConfig.actor ? ROLES[actionConfig.actor] : ROLES.ADMIN);
    const isPublicActor = actionConfig.actor === 'GUEST' || actionConfig.actor === 'ANY';

    // 2. [SANITATION] Multi-Layer Token Firewall
    let token = null;
    const authHeader = req.headers.authorization;


    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.substring(7);
      
      // Defensive Normalization
      if (rawToken === 'null' || rawToken === 'undefined') {
        console.warn(`[AUTH_SANITIZE] Neutralized invalid token string: "${rawToken}" from ${req.originalUrl}`);
        token = null;
      } else if (typeof rawToken !== 'string' || rawToken.length < 20) {
        console.warn(`[AUTH_SANITIZE] Rejected malformed token: length=${rawToken?.length || 0} endpoint=${req.originalUrl}`);
        token = null;
      } else {
        token = rawToken;
      }
    } else {
      token = req.cookies?.token;
    }

    if (!token) {
      // Allow public access ONLY if action is explicitly marked as GUEST/ANY and not requiring strong environment
      if (isPublicActor && !actionConfig.requiresStrong && mwConfig.allowPublic) {

        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Missing session token' });
    }


    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (isPublicActor && !actionConfig.requiresStrong && mwConfig.allowPublic) {
        console.warn(`[AUTH_RESILIENCE] Proceeding as guest on public route despite invalid token from ${req.ip}`);
        req.actor = null;
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }


    const { address, snapshotBlock, snapshotChainId, issuedAt, role: tokenRole } = decoded;

    // 🛡️ [SECURITY] Bunker V3.6: Ground-Truth Environment Recomputation (Step 4, 6 & 7)
    // We strictly distinguish between session confidence (token) and runtime reality.
    let runtimeEnv = 'VERIFIED';

    if (!snapshotBlock) {
      runtimeEnv = 'UNKNOWN'; // Ceiling for weak sessions (Step 4)
      console.warn(`[ACTOR_HANDSHAKE] Weak session detected (no snapshot block) for ${address}. Mapping to UNKNOWN.`);
    } else {
      try {
        // Step 6: Attempt to recompute environment state per request (Ground Truth)

        // 🛡️ [PHASE 2.2] Hierarchical Consensus Truth
        // We replace single JsonRpcProvider with fault-tolerant ProviderService
        const provider = await ProviderService.getProvider();

        // 🛡️ Step 5: Protect against RPC storms via Single-Flight Cache
        // 🛡️ Step 7: Tie environment integrity to lastGoodBlockTimestamp (Grace Window)
        const cacheResult = await blockCache.getLatest(provider);
        const currentBlock = cacheResult.block;
        const lastSeenAt = cacheResult.timestamp;

        const cacheAgeMs = Date.now() - lastSeenAt;
        const GRACE_WINDOW_MS = 120000; // 🛡️ Bunker V3.6.1: Expanded Grace Window (30s -> 120s) for reliability

        // Step 1: Check Chain Divergence
        const currentChainId = Number(systemConfig.chainId);
        if (Number(snapshotChainId) !== currentChainId) {
          runtimeEnv = 'UNKNOWN';
          console.error(`[ACTOR_HANDSHAKE] Chain ID mismatch: Token(${snapshotChainId}) vs Active(${currentChainId})`);
        }
        // Step 7: Enforcement of the Grace Window using ProviderService health
        else if (ProviderService.lastGoodBlock > 0 && (cacheAgeMs > GRACE_WINDOW_MS || !ProviderService.isSystemHealthy())) {
          runtimeEnv = 'UNKNOWN'; // Integrity lost due to lack of recent chain confirmation from ANY tier
          console.error(`[ACTOR_HANDSHAKE] Integrity bridge lost (Grace window or Provider blackout). Age: ${cacheAgeMs}ms`);
        }
        else if (ProviderService.lastGoodBlock === 0) {
          // 🛡️ [RESILIENCE] Cold-Start Grace: Allow DEGRADED entry while bridge is warming up
          runtimeEnv = 'DEGRADED';
          console.info(`[ACTOR_HANDSHAKE] Integrity bridge initializing. Allowing temporary DEGRADED access.`);
        }
        else {
          // Step 2: Check Block Staleness
          const age = currentBlock - snapshotBlock;

          // 🛡️ [SECURITY] Bunker V3.6.2: Self-Healing Active Recovery Gate
          // Staleness check (24h Window / ~43200 blocks on BSC)
          const HEALING_ENABLED = true; // 🛡️ [SAFETY] Temporary Kill Switch
          const STALE_ALLOWED_CAPABILITIES = new Set(['AUTH_PRECHECK', 'AUTH_LOGIN']);
          const isStale = (age > 43200);

          if (isStale && (!HEALING_ENABLED || !STALE_ALLOWED_CAPABILITIES.has(capability))) {
            runtimeEnv = 'UNKNOWN';
            console.error(`[ACTOR_HANDSHAKE] Terminal Staleness for ${address}: Age=${age} blocks. BypassAllowed=${STALE_ALLOWED_CAPABILITIES.has(capability)}`);
          } else if (age < 0) {
            // 🛡️ Possible chain reorg or provider lag
            runtimeEnv = 'DEGRADED';
            console.warn(`[ACTOR_HANDSHAKE] Block regression detected: Snapshot(${snapshotBlock}) > Current(${currentBlock})`);
          } else if (age > 50) { // PROTOCOL_LIMITS.BLOCK_STALENESS_LIMIT
            runtimeEnv = 'DEGRADED';
          } else {
            runtimeEnv = 'VERIFIED';
          }
        }
      } catch (envErr) {
        console.error(`[ACTOR_HANDSHAKE] Critical environment error for ${address}: ${envErr.message}`);
        runtimeEnv = 'UNKNOWN';
      }
    }

    // 🛡️ [ENFORCEMENT] Step 4: Integrity Ceiling
    // Mutations and high-risk actions are strictly blocked ONLY if environment is UNKNOWN.
    if (actionConfig.requiresStrong && runtimeEnv === 'UNKNOWN') {
      const errorDetail = 'Your session is in UNKNOWN mode (Weak Session or RPC failure). High-integrity mutations are blocked.';

      console.warn(`[AUTH_BLOCK] Integrity violation: '${capability}' requires VERIFIED/DEGRADED environment, but runtime state is ${runtimeEnv} for ${address}`);
      return res.status(403).json({
        error: 'Forbidden: High-Integrity action blocked',
        detail: errorDetail,
        runtimeEnv: runtimeEnv
      });
    }

    // 6. Live Authority Check (Mandatory for High Integrity, optional refresh for others)
    const jwtAgeMin = (Date.now() - issuedAt) / 60000;
    const needsLiveRefresh = (actionConfig.requiresStrong) || (jwtAgeMin > 5);

    if (needsLiveRefresh) {
      try {
        const { ethers } = require('ethers');
        const provider = await ProviderService.getProvider();
        const notaryRegistryAbi = [
          "function getUserRole(address) view returns (uint8)",
          "function isBanned(address) view returns (bool)"
        ];
        const notaryRegistry = new ethers.Contract(systemConfig.contracts.notaryRegistry, notaryRegistryAbi, provider);

        const [liveRole, isBanned] = await Promise.all([
          notaryRegistry.getUserRole(address),
          notaryRegistry.isBanned(address)
        ]);

        if (isBanned) {
          console.warn(`[AUTH_DENY] Banned user attempted access: ${address}`);
          return res.status(403).json({ error: 'Forbidden: Account Banned' });
        }

        // Enforcement Rule 8: A user is ACTIVE ONLY IF identity_state == ACTIVE AND blockchain role > 0
        const userRes = await pool.query("SELECT id, identity_state, is_deactivated, tx_status FROM users WHERE wallet_address = $1", [address]);
        const userInternal = userRes.rows[0];
        const identityState = userInternal?.identity_state;
        const isDeactivated = userInternal?.is_deactivated;
        const txStatus = userInternal?.tx_status;

        // 🛡️ CRITICAL GUARD: Explicitly Block REJECTED Identities
        if (identityState === 'REJECTED') {
          console.warn(`[AUTH_DENY] Rejected identity attempted access: ${address}`);
          return res.status(403).json({
            error: 'Forbidden: User identity rejected',
            detail: 'Your identity verification was rejected by a system administrator. Please contact support.'
          });
        }

        const kycEnforced = process.env.ENFORCE_KYC === 'true';

        if (!kycEnforced) {
          if (isDeactivated || identityState === 'DEACTIVATED') {
            console.warn(`[AUTH_DENY] Deactivated/Blocked user attempted access: ${address}`);
            return res.status(403).json({ error: 'Forbidden: Account Blocked' });
          }
          if (identityState !== 'ACTIVE') {
            return res.status(403).json({
              error: 'Forbidden: Identity not active',
              detail: `Your current status is: ${identityState}. Please wait for verification.`
            });
          }
        } else {
          const isChainValid = Number(liveRole) > 0;
          const isDbActive = identityState === 'ACTIVE';

          if (!isDbActive || !isChainValid) {
            console.warn(`[AUTH_DENY] Double-Lock Failure for ${address}. DB: ${identityState}, Chain Role: ${liveRole}`);
            return res.status(403).json({
              error: 'Forbidden: User identity not fully verified',
              detail: `Identity verification required. DB: ${identityState}, Chain: ${liveRole}`
            });
          }
        }

        const activeRole = Number(liveRole) > 0 ? Number(liveRole) : normalizeRole(tokenRole);
        req.actor = { id: decoded.id, address, role: activeRole, verifiedAt: Date.now(), identityState, txStatus };

        // Final Authorization Guard
        if (req.actor.role < effectiveMinRole) {
          return res.status(403).json({
            error: 'Forbidden: Insufficient privileges',
            detail: `Role level ${effectiveMinRole} required. Current level: ${req.actor.role}`
          });
        }
      } catch (err) {
        console.error(`[AUTH_ERROR] Live check failed for ${address}:`, err.message);
        
        // 🛡️ [RESILIENCE] Admin Identity Persistence (Bunker V3.6.4)
        // If the live on-chain check fails but the bearer is an Admin, allow the request 
        // to proceed in DEGRADED mode to prevent administrative deadlocks.
        if (normalizeRole(tokenRole) >= ROLES.ADMIN) {
          console.warn(`[AUTH_RESILIENCE] Admin ${address} allowed via Token Persistence (RPC Blackout)`);
          req.actor = { 
            id: decoded.id, 
            address, 
            role: ROLES.ADMIN, 
            isDegraded: true,
            identityState: 'ACTIVE' // Optimization for Admin routes
          };
          return next();
        }

        return res.status(503).json({ error: 'Service Unavailable: Authority Verification Failed' });
      }
    } else {
      // 7. JWT Authority (Fresh & Risk Low) - Actor from Token
      req.actor = {
        id: decoded.id,
        address,
        role: normalizeRole(decoded.role),
        isDegraded: decoded.zeroTrustStatus === 'DEGRADED'
      };

    }

    // 8. Eligibility Enforcement
    if (req.actor.role < effectiveMinRole) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges',
        detail: `Role level ${effectiveMinRole} required. Current level: ${req.actor.role}`
      });
    }

    // 🛡️ [INTEGRITY] Establish Ironclad Audit Context for the request lifecycle
    const store = dbContext.getStore();

    // 1. Structural Guard: Ensure we are inside a root database context
    if (!store) {
      throw new pool.BBSNSEnforcementError("STRUCTURAL_ERROR: Database context missing");
    }

    // 2. Identity Guard: Ensure identity was properly derived by the authority layer
    if (!req.actor || req.actor.role === undefined || req.actor.id === undefined) {
      throw new pool.BBSNSEnforcementError("AUTH_ERROR: Protected route accessed without valid actor state");
    }

    // 3. Write-Once Corruption Guard: Prevent cross-request or same-role/different-user collisions
    if (store.actor && store.actor !== 'GUEST' && req.actor && (store.actor !== req.actor.role || store.actorId !== req.actor.id)) {
      throw new pool.BBSNSEnforcementError(`SECURITY_ERROR: Audit context corruption detected for request ${store.requestId}`);
    }

    // 4. Authorized Promotion: Finalize identity affinity for the remainder of the trace
    if ((!store.actor || store.actor === 'GUEST') && req.actor) {
      store.actor = req.actor.role;
      store.actorId = req.actor.id;
      store.service = 'USER_API';

      // 5. Audit Pulse
      console.log(`[CTX_ACTOR_SET] actor=${store.actor} actorId=${store.actorId} requestId=${store.requestId}`);
    }

    return next();
  };
  Object.defineProperty(middleware, 'name', { value: 'requirePrivilege' });
  return middleware;
}

// Audit compliance shim: Ensures even public routes have a trace context for the sentinel
function allowPublic(req, res, next) {
  const context = {
    requestId: req.id || req.headers['x-request-id'] || 'PUBLIC-' + Date.now(),
    service: 'PUBLIC_API',
    actor: 'GUEST',
    actorId: 0,
    timestamp: new Date()
  };

  dbContext.run(context, () => {
    next();
  });
}
Object.defineProperty(allowPublic, 'name', { value: 'allowPublic' });

/**
 * 🛡️ [SECURITY] System Context Bridge (INTERNAL ONLY)
 * Allows background workers (Identity Sync, Reconciliation) to perform legitimate 
 * mutations while ensuring they remain isolated from the web request lifecycle.
 */
function runWithSystemContext(service, reason, fn) {
  const run = () => {
    const store = dbContext.getStore();
    if (!store) {
      // This should be impossible inside dbContext.run()
      throw new BBSNSEnforcementError("STRUCTURAL_ERROR: Context creation failed");
    }
    store.userId = ACTOR_IDS.SYSTEM;
    store.actorId = ACTOR_IDS.SYSTEM;
    store.reason = `SYSTEM_ACTION: ${reason}`;
    store.service = service || 'BACKGROUND_WORKER';
    store.contextType = 'SYSTEM';

    return fn();
  };

  // 🛡️ [ENFORCEMENT] structural Execution Isolation
  if (process.env.BBSNS_RUNTIME !== 'worker') {
    console.error(`❌ [ISOLATION_VIOLATION] from ${process.env.BBSNS_RUNTIME || 'WEB_ROUTER'}`);
    throw new BBSNSEnforcementError('ISOLATION_VIOLATION: System context structural forbidden');
  }

  const existingStore = dbContext.getStore();
  if (existingStore) {
    return run();
  } else {
    // 🔄 [BRIDGE] Initialize root context for standalone worker process
    return dbContext.run({}, run);
  }
}

/**
 * 🛡️ [SECURITY] Guest Context Bridge
 * Allows public mutation routes (Nonces, Remote Sessions) to proceed under a 
 * "GUEST" audit context. Combined with Sentinel table-restrictions.
 */
function withGuestContext(req, res, next) {
  const store = dbContext.getStore();

  if (!store) {
    throw new BBSNSEnforcementError("STRUCTURAL_ERROR: Guest Context used before root initialization");
  }

  // Mutate standardized object properties
  store.actor = 'GUEST';
  store.actorId = ACTOR_IDS.GUEST;
  store.userId = ACTOR_IDS.GUEST;
  store.service = 'GUEST_API';

  return next();
}
Object.defineProperty(withGuestContext, 'name', { value: 'withGuestContext' });

module.exports = {
  loadActor,
  requireRole,
  requirePrivilege,
  allowPublic,
  withGuestContext,
  runWithSystemContext,
  ACTOR_IDS,
  ROLES,
  RISK_LEVELS,
  rejectTransactionModification,
  restrictDocumentUpdate
};
