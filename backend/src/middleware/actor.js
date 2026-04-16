const jwt = require('jsonwebtoken');
const pool = require('../db/index.js');
const dbContext = require('../db/context');
const ConfigService = require('../services/config.service');

const { ROLES, RISK_LEVELS, ACTOR_IDS } = require('../constants/protocol');

/**
 * 🛡️ [SECURITY] HIGH RISK ACTIONS
 * These represent system critical mutations that MUST be blocked if the 
 * session is in DEGRADED mode (i.e. RPC was down during login).
 */
const HIGH_RISK_ACTIONS = [
  'NOTARIZE_DOCUMENT',
  'APPROVE_DOCUMENT',
  'REJECT_DOCUMENT',
  'ADMIN_ACTION',
  'TOKEN_OPERATION',
  'GOVERNANCE_VOTE'
];

// Zero-Trust Role Normalization
const normalizeRole = (role) => {
  if (typeof role === 'number') return role;
  const ROLE_MAP = { 'none': 0, 'user': 1, 'owner': 1, 'notary': 2, 'admin': 3 };
  const normalized = ROLE_MAP[String(role).toLowerCase()];
  return normalized !== undefined ? normalized : 0;
};

// Legacy shim for non-refactored routes (Transition phase)
async function loadActor(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : (req.cookies?.token);

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
function requirePrivilege(config) {
  const { minRole, risk } = config || {};
  const middleware = async function requirePrivilege(req, res, next) {
    // 1. Mandatory Capability Declaration
    if (minRole === undefined || risk === undefined || minRole === null || risk === null) {
      console.error(`[AUTH_ERROR] Missing capability declaration for route: ${req.originalUrl}`);
      console.error(`[AUTH_DEBUG] config:`, config);
      console.error(`[AUTH_DEBUG] minRole: ${minRole}, risk: ${risk}`);
      return res.status(500).json({ error: 'Middleware Configuration Error: Missing capability declaration' });
    }

    // 2. JWT Extraction & Basic Validation
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : (req.cookies?.token);

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing session token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const { address, snapshotBlock, snapshotChainId, issuedAt, zeroTrustStatus, role: tokenRole } = decoded;

    // 🛡️ [SECURITY] DEGRADED Mode Enforcement
    // If the session was initialized in DEGRADED mode, block all RISK_HIGH or listed HIGH_RISK_ACTIONS.
    if (zeroTrustStatus === 'DEGRADED') {
        const isHighRiskLevel = risk === RISK_LEVELS.HIGH;
        const isHighRiskAction = config.capability && HIGH_RISK_ACTIONS.includes(config.capability);
        
        if (isHighRiskLevel || isHighRiskAction) {
            console.warn(`[AUTH_BLOCK] DEGRADED session blocked from high-risk action: ${config.capability || req.originalUrl} for ${address}`);
            return res.status(403).json({ 
                error: 'Forbidden: Zero-Trust re-verification required',
                detail: 'Your session is in DEGRADED mode due to transient blockchain connectivity issues. Please log out and log in again to upgrade your security status.'
            });
        }
    }

    // 3. Chain ID Integrity (Server-Authoritative)
    const config = await ConfigService.getConfig();
    if (String(snapshotChainId) !== String(config.chainId)) {
      return res.status(426).json({ error: 'Upgrade Required: Incorrect Network Context' });
    }

    // 4. Block Continuity & Sanity Checks
    let currentBlock;
    try {
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      currentBlock = await provider.getBlockNumber();

      // Future-dated check (Tolerance: 10 blocks)
      if (snapshotBlock > currentBlock + 10) {
        return res.status(426).json({ error: 'Upgrade Required: Forward Block Drift Detected' });
      }

      // Staleness check (24h Window / ~28k blocks on BSC)
      if (currentBlock - snapshotBlock > 43200) {
        return res.status(426).json({ error: 'Upgrade Required: Session State Stale' });
      }
    } catch (rpcErr) {
      // 5. Degraded Mode (RPC Down)
      if (risk === RISK_LEVELS.HIGH) {
        console.error(`[AUTH_CRITICAL] RPC Down during RISK_HIGH mutation. Denying access for ${address}`);
        return res.status(503).json({ error: 'Service Unavailable: Authority Unverifiable (RPC Down)' });
      }

      // RISK_LOW Grace Period (5 minutes)
      const ageInMinutes = (Date.now() - issuedAt) / 60000;
      if (ageInMinutes > 5) {
        return res.status(503).json({ error: 'Service Unavailable: Authority Stale & RPC Down' });
      }

      // Allow RISK_LOW if fresh enough
      req.actor = { id: decoded.id, address, role: normalizeRole(decoded.role), isDegraded: true };
      
      if (req.actor.role < minRole) {
        return res.status(403).json({
          error: 'Forbidden: Insufficient privileges',
          detail: `Role level ${minRole} required. Current level: ${req.actor.role}`
        });
      }
      // Re-entry point for context sync logic
    }

    // 6. Live Authority Check (Mandatory for RISK_HIGH, optional refresh for RISK_LOW)
    const jwtAgeMin = (Date.now() - issuedAt) / 60000;
    const needsLiveRefresh = (risk === RISK_LEVELS.HIGH) || (jwtAgeMin > 5);

    if (needsLiveRefresh) {
      try {
        const { ethers } = require('ethers');
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const notaryRegistryAbi = [
          "function getUserRole(address) view returns (uint8)",
          "function isBanned(address) view returns (bool)"
        ];
        const notaryRegistry = new ethers.Contract(config.contracts.notaryRegistry, notaryRegistryAbi, provider);

        const [liveRole, isBanned] = await Promise.all([
          notaryRegistry.getUserRole(address),
          notaryRegistry.isBanned(address)
        ]);

        if (isBanned) {
          console.warn(`[AUTH_DENY] Banned user attempted access: ${address}`);
          return res.status(403).json({ error: 'Forbidden: Account Banned' });
        }

        // Enforcement Rule 8: A user is ACTIVE ONLY IF identity_state == ACTIVE AND blockchain role > 0
        const userRes = await pool.query("SELECT id, identity_state, is_deactivated FROM users WHERE wallet_address = $1", [address]);
        const userInternal = userRes.rows[0];
        const identityState = userInternal?.identity_state;
        const isDeactivated = userInternal?.is_deactivated;

        // 🛡️ CRITICAL GUARD: Explicitly Block REJECTED Identities
        // This must run BEFORE the MVP toggle to ensure suspicious accounts are fail-closed.
        if (identityState === 'REJECTED') {
          console.warn(`[AUTH_DENY] Rejected identity attempted access: ${address}`);
          return res.status(403).json({ 
            error: 'Forbidden: User identity rejected',
            detail: 'Your identity verification was rejected by a system administrator. Please contact support.'
          });
        }

        // MVP Alignment: If ENFORCE_KYC is disabled, allow non-blocked users to bypass strict identity check
        const kycEnforced = process.env.ENFORCE_KYC === 'true';
        
        // MVP Logic: If ENFORCE_KYC is false, prioritize the DB identity_state
        if (!kycEnforced) {
          if (isDeactivated || identityState === 'DEACTIVATED') {
            console.warn(`[AUTH_DENY] Deactivated/Blocked user attempted access: ${address}`);
            return res.status(403).json({ error: 'Forbidden: Account Blocked' });
          }
          
          // Allow ACTIVE users even if blockchain sync isn't complete yet
          if (identityState !== 'ACTIVE') {
            return res.status(403).json({ 
              error: 'Forbidden: Identity not active',
              detail: `Your current status is: ${identityState}. Please wait for verification.`
            });
          }
        } else {
          // Double-Lock: strict DB state check AND on-chain role check (Production mode)
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

        // Identity Invariant Rule: Revert to verified token role if blockchain sync lags in MVP mode.
        const activeRole = Number(liveRole) > 0 ? Number(liveRole) : normalizeRole(tokenRole);
        req.actor = { id: decoded.id, address, role: activeRole, verifiedAt: Date.now(), identityState };


        
        // Final Authorization Guard
        if (req.actor.role < minRole) {
          return res.status(403).json({
            error: 'Forbidden: Insufficient privileges',
            detail: `Role level ${minRole} required. Current level: ${req.actor.role}`
          });
        }
        // Fall through to context sync logic
      } catch (err) {
        console.error(`[AUTH_ERROR] Live check failed for ${address}:`, err.message);
        return res.status(503).json({ error: 'Service Unavailable: Authority Verification Failed' });
      }
    } else {
        // 7. JWT Authority (Fresh & Risk Low) - Actor from Token
        req.actor = { 
            id: decoded.id, 
            address, 
            role: normalizeRole(decoded.role), 
            isDegraded: false 
        };
    }

    // 8. Eligibility Enforcement
    if (req.actor.role < minRole) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges',
        detail: `Role level ${minRole} required. Current level: ${req.actor.role}`
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
    if (store.actor && (store.actor !== req.actor.role || store.actorId !== req.actor.id)) {
      throw new pool.BBSNSEnforcementError(`SECURITY_ERROR: Audit context corruption detected for request ${store.requestId}`);
    }

    // 4. Authorized Promotion: Finalize identity affinity for the remainder of the trace
    if (!store.actor) {
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

// Audit compliance shim
function allowPublic(req, res, next) {
  next();
}
Object.defineProperty(allowPublic, 'name', { value: 'allowPublic' });

/**
 * 🛡️ [SECURITY] System Context Bridge (INTERNAL ONLY)
 * Allows background workers (Identity Sync, Reconciliation) to perform legitimate 
 * mutations while ensuring they remain isolated from the web request lifecycle.
 */
function runWithSystemContext(service, reason, fn) {
    const store = dbContext.getStore();
    
    // 🛡️ [ENFORCEMENT] structural Execution Isolation
    if (process.env.BBSNS_RUNTIME !== 'worker') {
        console.error(`❌ [ISOLATION_VIOLATION] from ${process.env.BBSNS_RUNTIME || 'WEB_ROUTER'}`);
        throw new BBSNSEnforcementError('ISOLATION_VIOLATION: System context structural forbidden');
    }

    if (!store) {
        throw new BBSNSEnforcementError("STRUCTURAL_ERROR: System context used before root initialization");
    }

    // Mutate existing store
    store.userId = ACTOR_IDS.SYSTEM;
    store.actorId = ACTOR_IDS.SYSTEM;
    store.reason = `SYSTEM_ACTION: ${reason}`;
    store.service = service || 'BACKGROUND_WORKER';

    return fn();
}

/**
 * 🛡️ [SECURITY] Guest Context Bridge
 * Allows public mutation routes (Nonces, Remote Sessions) to proceed under a 
 * "GUEST" audit context. Combined with Sentinel table-restrictions.
 */
function withGuestContext(req, res, next) {
    const store = dbContext.getStore();
    console.log("CTX INIT CHECK:", !!store);

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
