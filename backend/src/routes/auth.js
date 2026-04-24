const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db/index');
const dbContext = require('../db/context');
const crypto = require('crypto');
const { ACTOR_IDS } = require('../constants/protocol');
const { generateNonce } = require('../utils/nonce');
const { ethers } = require('ethers');
const ConfigService = require('../services/config.service');
const ProviderService = require('../blockchain/provider-service');
const { 
    IDENTITY_PROTOCOL, 
    buildSigningMessage 
} = require('../constants/identity');
const { 
    verifyProtocolSignature 
} = require('../utils/identity-crypto');
const { loginSchema, validateBody } = require('../utils/validation');

const APP_NAME = 'BBSNS';
const getJWTSecret = () => {
  if (!process.env.JWT_SECRET) {
     console.error("❌ [AUTH_FATAL] JWT_SECRET is missing after handshake.");
     process.exit(1);
  }
  return process.env.JWT_SECRET;
};
const JWT_EXPIRY = '12h'; 
const JWT_EXPIRY_SECONDS = 12 * 60 * 60; 

// UUID validation helper - prevents Postgres cast errors on invalid session IDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

// 🛡️ [SECURITY] Authoritative Cookie Configuration
// sameSite: 'none' and secure: true are REQUIRED for cross-subdomain auth (app vs api)
// path: '/' ensures the cookie is cleared from the root, not just the /auth prefix
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, 
  sameSite: 'none',
  path: '/'
};

const { requirePrivilege, allowPublic, withGuestContext, ROLES, RISK_LEVELS } = require('../middleware/actor');
const { withDomain, withAction, withMutation } = require('../middleware/policy');
const UserService = require('../services/UserService');

// Hardened Rate Limiter: IP + Wallet + Endpoint binding with cooldown escalation
const distributedRateLimiter = require('../utils/rate-limiter');
const simpleRateLimiter = distributedRateLimiter; // Alias for backward compatibility in this file

/**
 * 🛡️ [RESILIENCE] RPC Timeout Wrapper
 * Prevents sequential blocking by enforcing a strict SLA on blockchain queries.
 */
const withTimeout = (promise, ms, label = "RPC_TIMEOUT") => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      console.warn(`[${label}] Logic exceeded ${ms}ms limit.`);
      reject(new Error(label));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * 🛡️ [RESILIENCE] Hierarchical Backoff Retry
 * Handles transient network/RPC stalls during critical auth handshakes.
 */
async function executeWithRetry(fn, maxRetries = 3, label = "AUTH_TASK") {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await withTimeout(fn(), 1500, `${label}_ATTEMPT_${i+1}`);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = 200 * (i + 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

// Zero-Trust JWT Helper
async function signZeroTrustToken(user, walletAddress, zeroTrustStatus = 'VERIFIED', extraClaims = {}) {
  if (!user || !walletAddress) throw new Error("Missing user data for token signing");
  
  let snapshotBlock = null;
  let snapshotChainId = null;

  try {
    const config = await ConfigService.getConfig();
    const provider = await ProviderService.getProvider();
    
    // Attempt resilient fetching of chain state
    const chainState = await executeWithRetry(async () => {
      const network = await provider.getNetwork();
      const block = await provider.getBlockNumber();
      return { chainId: Number(network.chainId), block: Number(block) };
    }, 3, "JWT_CHAIN_SYNC");

    snapshotChainId = chainState.chainId;
    snapshotBlock = chainState.block;
  } catch (err) {
    console.warn(`[RESILIENCE_FALLBACK] Failed to fetch chain state for JWT. Defaulting to DEGRADED. Detail: ${err.message}`);
    zeroTrustStatus = 'DEGRADED';
  }

  try {
    let numericRole = Number(user.role);
    if (isNaN(numericRole)) {
      const ROLE_MAP = { 'none': 0, 'user': 1, 'notary': 2, 'admin': 3 };
      numericRole = ROLE_MAP[String(user.role).toLowerCase()] || 1; // Default to 'user' (1)
    }

    return jwt.sign(
      {
        id: user.id,
        address: walletAddress.toLowerCase(),
        role: Number(numericRole),
        snapshotBlock: Number(snapshotBlock),
        snapshotChainId: Number(snapshotChainId),
        zeroTrustStatus, // 🛡️ [MANDATORY] embedded status
        issuedAt: Date.now(),
        ...extraClaims // 🛡️ [Hardening] Inject provenance/session claims (source: remote_auth, etc)
      },
      getJWTSecret(),
      { expiresIn: JWT_EXPIRY }
    );
  } catch (err) {
    console.error("[JWT_SIGN_ERROR] Failed to sign token:", err.message);
    throw err;
  }
}

// POST /auth/pre-check - Verify account existence (Wallet-Only identity)
router.post('/pre-check', withGuestContext, withDomain('AUTH'), withAction('AUTH_PRECHECK'), requirePrivilege({ capability: 'AUTH_PRECHECK', allowPublic: true }), async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required for pre-check' });
    }

    const normalizedWallet = walletAddress.trim().toLowerCase();
    const result = await pool.query('SELECT role FROM users WHERE LOWER(wallet_address) = $1', [normalizedWallet]);

    if (result.rows.length === 0) {
      return res.json({ exists: false, role: null });
    }

    res.json({ exists: true, role: result.rows[0].role });
  } catch (error) {
    console.error('Pre-check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/nonce - Hardened blind-trust eliminator
router.post('/nonce', withGuestContext, withDomain('AUTH'), withAction('AUTH_NONCE'), withMutation(), requirePrivilege({ capability: 'AUTH_NONCE', allowPublic: true }), async (req, res) => {
  try {
    const { wallet_address, purpose, payload } = req.body;
    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    const normalizedWalletAddress = wallet_address.toLowerCase();
    const noncePurpose = (purpose || 'LOGIN').toUpperCase();
    const protocolVersion = req.body.version || IDENTITY_PROTOCOL.DEFAULT_VERSION;

    const result = await pool.runWithContext({
        userId: ACTOR_IDS.GUEST,
        reason: 'AUTH_NONCE_GENERATION',
        route: req.originalUrl,
        requestId: (dbContext.getStore() || {}).requestId || 'UNKNOWN',
        service: 'GUEST_API'
    }, async (client) => {
        // 🛡️ [SECURITY] Semantic Cooldown Enforcement (Action-Scoped)
        const recentNonce = await client.query(
            `SELECT issued_at FROM auth_nonces 
             WHERE LOWER(wallet_address) = $1 AND action = $2 
             AND issued_at > NOW() - INTERVAL '30 seconds'
             ORDER BY issued_at DESC LIMIT 1`,
            [normalizedWalletAddress, noncePurpose]
        );

        if (recentNonce.rows.length > 0) {
            const elapsed = Date.now() - new Date(recentNonce.rows[0].issued_at).getTime();
            const retry_after = Math.ceil((30000 - elapsed) / 1000);
            return { throttled: true, retry_after };
        }

        // 1. Generate and store new nonce (Upsert pattern for Action-Scoping)
        const nonce = generateNonce();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await client.query(
          `INSERT INTO auth_nonces (wallet_address, nonce, action, expires_at) 
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (wallet_address, action) 
           DO UPDATE SET nonce = EXCLUDED.nonce, expires_at = EXCLUDED.expires_at, issued_at = NOW(), used = false`,
          [normalizedWalletAddress, nonce, noncePurpose, expiry]
        );

        return { nonce, expiry };
    });

    if (result.throttled) {
        return res.status(429).json({ 
            error: 'Request too frequent', 
            code: 'NONCE_COOLDOWN',
            state: 'RATE_LIMITED',
            retry_after: result.retry_after 
        });
    }

    const { nonce, expiry } = result;

    // 3. Reconstruct canonical challenge template (Versioned & Hash Scoped)
    let generatedPayloadHash = null;
    const { SCHEMA_CONFIG } = require('../constants/identity');
    const { calculatePayloadHash } = require('../utils/identity-crypto');
    
    if (payload && SCHEMA_CONFIG[protocolVersion] && SCHEMA_CONFIG[protocolVersion].requiresPayloadHash[noncePurpose]) {
        try {
            generatedPayloadHash = calculatePayloadHash(protocolVersion, noncePurpose, payload);
        } catch (normErr) {
            console.error('[NONCE_HASH_FAIL]', normErr);
        }
    }
    
    const message_template = buildSigningMessage(noncePurpose, nonce, normalizedWalletAddress, generatedPayloadHash, protocolVersion);

    res.json({
      nonce,
      expiry: expiry.toISOString(),
      message_template,
      state: 'NONCE_GENERATED',
      code: 'AUTH_CHALLENGE_ISSUED'
    });
  } catch (error) {
    console.error('Error generating nonce:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/system-status - Required for Desktop App startup check
router.get('/system-status', allowPublic, requirePrivilege({ capability: 'AUTH_SYSTEM_STATUS', allowPublic: true }), async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const provider = await ProviderService.getProvider();
    
    // 🛡️ [RESILIENCE] Protected blockchain verification
    let adminCount = 1; 
    let activated = null; // null = Uncertain/Timeout
    let isChainUp = true;

    try {
      const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function adminCount() view returns (uint256)"], provider);
      const genesisContract = new ethers.Contract(config.contracts.genesisActivation, ["function activated() view returns (bool)"], provider);

      // 🛡️ [RESILIENCE] Try Primary Provider first (10s)
      try {
        const [chainAdminCount, chainActivated] = await Promise.all([
          withTimeout(registry.adminCount().catch(() => 1n), 10000, "AdminCount"),
          withTimeout(genesisContract.activated().catch(() => false), 10000, "SystemActivation")
        ]);
        
        adminCount = Number(chainAdminCount);
        activated = !!chainActivated;
      } catch (primaryErr) {
        console.log(`[AUTH_RESCUE] Primary provider stalled (${primaryErr.message}). Initiating Atomic Rescue...`);
        
        // 🚨 [ATOMIC_RESCUE] Direct HTTPS Fallback to bypass sticky WebSocket/stalled node
        const rescueProvider = new ethers.JsonRpcProvider(config.rpcUrl, { chainId: 97, name: 'bnbt' }, { staticNetwork: true });
        const rescueRegistry = new ethers.Contract(config.contracts.notaryRegistry, ["function adminCount() view returns (uint256)"], rescueProvider);
        const rescueGenesis = new ethers.Contract(config.contracts.genesisActivation, ["function activated() view returns (bool)"], rescueProvider);

        const [rescueAdminCount, rescueActivated] = await Promise.all([
          withTimeout(rescueRegistry.adminCount().catch(() => 1n), 5000, "RescueAdminCount"),
          withTimeout(rescueGenesis.activated().catch(() => false), 5000, "RescueActivation")
        ]);

        adminCount = Number(rescueAdminCount);
        activated = !!rescueActivated;
        console.log(`[AUTH_RESCUE] 💊 Rescue successful. System state recovered via direct HTTPS.`);
      }
    } catch (rpcErr) {
      console.warn("[AUTH_FATAL] All RPC providers failed for system-status:", rpcErr.message);
      isChainUp = false;
    }

    // DB Check (Local Authority Signal)
    const dbUserResult = await pool.query('SELECT COUNT(*) FROM users');
    const dbUserCount = parseInt(dbUserResult.rows[0].count);

    res.json({ 
      activated, // real blockchain truth (null if timeout)
      hasUsers: dbUserCount > 0, // database signal
      isChainUp, // connectivity status
      adminCount,
      dbUserCount,
      status: isChainUp ? "ok" : "degraded",
      health: { chain: isChainUp }
    });
  } catch (error) {
    console.error('[AUTH_FATAL] Status resolution failed:', error);
    res.status(200).json({ 
        activated: null, 
        hasUsers: false,
        isChainUp: false,
        status: "degraded", 
        error: "Connectivity unstable" 
    });
  }
});


// POST /auth/genesis/onboard - The ONLY mutated path for Admin creation
router.post('/genesis/onboard', withDomain('ADMIN'), withGuestContext, withAction('ADMIN_ONBOARD_GENESIS'), withMutation(), simpleRateLimiter(10, 3600000), requirePrivilege({ capability: 'ADMIN_ONBOARD_GENESIS', allowPublic: true }), async (req, res) => {
  try {
    const { fullName, email, walletAddress, nationalId, signature, nonce } = req.body;

    if (!fullName || !walletAddress || !nationalId || !signature || !nonce) {
      return res.status(400).json({ error: 'Missing onboarding metadata' });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // 1. Deterministic Protocol Verification (Atomic Consumption)
    // Genesis onboarding uses NO payload hash as it's a seed action.
    try {
      await verifyProtocolSignature({
        purpose: 'GENESIS_ONBOARD',
        nonce,
        wallet: normalizedWalletAddress,
        signature,
        rawPayload: {},
        requestId: (dbContext.getStore() || {}).requestId || 'GENESIS_ONBOARD'
      });
    } catch (authErr) {
      return res.status(401).json({ 
        error: authErr.message,
        code: 'AUTH_FAILED',
        state: 'REJECTED'
      });
    }

    // 4. On-Chain Check
    const config = await ConfigService.getConfig();
    const provider = await ProviderService.getProvider();
    const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function adminCount() view returns (uint256)", "function getUserRole(address) view returns (uint8)"], provider);
    const genesisContract = new ethers.Contract(config.contracts.genesisActivation, ["function activated() view returns (bool)", "function activationTimestamp() view returns (uint256)"], provider);

    const [adminCount, userRole, activated, activationTime] = await Promise.all([
      registry.adminCount(),
      registry.getUserRole(normalizedWalletAddress),
      genesisContract.activated(),
      genesisContract.activationTimestamp()
    ]);

    if (!activated) return res.status(403).json({ error: 'System not yet activated on-chain' });
    
    const MAX_TIME_WINDOW = 7 * 24 * 60 * 60;
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - Number(activationTime) > MAX_TIME_WINDOW) {
      return res.status(403).json({ error: 'Genesis onboarding window expired' });
    }

    if (Number(adminCount) !== 1) return res.status(403).json({ error: 'Genesis window closed' });
    if (Number(userRole) !== 3) return res.status(403).json({ error: 'Unauthorized role' });

    // 5. Create Profile using UserService for atomic audit entry
    // 🛡️ [SIGNUP_CONTRACT] National ID Normalization: TRIM -> REMOVE ALL SPACES -> UPPERCASE
    const normalizedNationalId = (nationalId || "").toString().replace(/\s+/g, '').toUpperCase();
    const nationalIdHash = crypto.createHash('sha256').update(normalizedNationalId).digest('hex');
    
    await pool.runWithContext({
      userId: ACTOR_IDS.GUEST,
      reason: 'ADMIN_ONBOARDING',
      route: req.originalUrl,
      requestId: req.requestId || 'UNKNOWN',
      service: 'AUTH_SERVICE'
    }, async (auditClient) => {
      await UserService.createUser({
        name: fullName,
        email: (email || '').toLowerCase().trim(),
        wallet_address: normalizedWalletAddress,
        role: 'admin',
        is_human_verified: true,
        national_id_hash: nationalIdHash,
        password_hash: 'ADMIN_WEB3_ONLY',
        username: normalizedWalletAddress,
        identity_state: 'ACTIVE'
      }, auditClient);
    });

    res.json({ success: true, message: 'Genesis Admin Onboarded Successfully' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Admin profile already exists' });
    }
    console.error('Onboarding failed:', error);
    res.status(500).json({ error: 'Onboarding failed internally' });
  }
});

// POST /auth/notary/onboard - Explicit path for on-chain Notaries to sync to DB
router.post('/notary/onboard', withDomain('NOTARY'), withGuestContext, withAction('NOTARY_ONBOARD'), withMutation(), simpleRateLimiter(5, 3600000), requirePrivilege({ capability: 'NOTARY_ONBOARD', allowPublic: true }), async (req, res) => {
  try {
    const { fullName, walletAddress, nonce, signature } = req.body;

    if (!fullName || !walletAddress || !nonce || !signature) {
      return res.status(400).json({ error: 'Missing Notary onboarding data' });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // 1. Deterministic Protocol Verification
    try {
      await verifyProtocolSignature({
        purpose: 'NOTARY_ONBOARD',
        nonce,
        wallet: normalizedWalletAddress,
        signature,
        rawPayload: {}, // Initial onboard usually seed profile
        requestId: (dbContext.getStore() || {}).requestId || 'NOTARY_ONBOARD'
      });
    } catch (authErr) {
      return res.status(401).json({ error: authErr.message });
    }

    // 3. On-Chain Check
    const config = await ConfigService.getConfig();
    const provider = await ProviderService.getProvider();
    const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)"], provider);
    const liveRole = await registry.getUserRole(normalizedWalletAddress);

    if (Number(liveRole) !== 2) return res.status(403).json({ error: 'Not authorized role' });

    // 4. Create Profile via UserService
    await pool.runWithContext({
      userId: ACTOR_IDS.GUEST,
      reason: 'NOTARY_ONBOARDING_SYNC',
      route: req.originalUrl,
      requestId: req.requestId || 'UNKNOWN',
      service: 'AUTH_SERVICE'
    }, async (auditClient) => {
      await UserService.createUser({
        name: fullName,
        wallet_address: normalizedWalletAddress,
        role: 'notary',
        is_human_verified: true,
        password_hash: 'NOTARY_WEB3_ONLY',
        identity_state: 'ACTIVE'
      }, auditClient);
    });

    res.json({ success: true, message: 'Notary profile created successfully' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Notary profile already exists' });
    }
    console.error('Notary onboarding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login - The primary authority bridge
router.post('/login', validateBody(loginSchema), withDomain('AUTH'), withGuestContext, withAction('AUTH_LOGIN'), withMutation(), requirePrivilege({ capability: 'AUTH_LOGIN', allowPublic: true }), async (req, res) => {
  try {
    const { email, password, walletAddress, signature, nationalId, signature_nonce, nonce } = req.body;
    const normalizedWalletAddress = (walletAddress || "").trim().toLowerCase();

    console.log(`[LOGIN_DEBUG] Attempting login for wallet: "${normalizedWalletAddress}"`);

    if (!walletAddress || !signature || (!signature_nonce && !nonce)) {
      return res.status(400).json({ error: 'Wallet address, signature, and nonce are required' });
    }

    // 🛡️ [Hardening 2.9C-A] Early Blockchain Gate
    // We verify identity on-chain BEFORE entering the audited DB context to prevent RPC latency 
    // from blocking database connections and to ensure strict separation of concerns.
    let liveRoleValue, liveBanned;
    try {
      const liveConfig = await ConfigService.getConfig();
      const provider = await ProviderService.getProvider();
      const notaryRegistryAbi = ["function getUserRole(address) view returns (uint8)", "function isBanned(address) view returns (bool)"];
      const notaryRegistry = new ethers.Contract(liveConfig.contracts.notaryRegistry, notaryRegistryAbi, provider);

      [liveRoleValue, liveBanned] = await Promise.all([
        notaryRegistry.getUserRole(normalizedWalletAddress),
        notaryRegistry.isBanned(normalizedWalletAddress)
      ]);

      if (liveBanned) {
        return res.status(403).json({ error: 'Account is banned on-chain', state: 'BANNED' });
      }
    } catch (chainErr) {
      console.error("[CHAIN_FETCH_ERROR]", chainErr.message);
      // Fallback: If we can't reach the chain, we can only proceed if the user already exists in DB.
      // However, for high-security login, we fail if the chain is unreachable and user is missing.
    }

    const result = await pool.runWithContext({
        userId: ACTOR_IDS.GUEST,
        reason: 'AUTH_LOGIN_HANDSHAKE',
        route: req.originalUrl,
        requestId: (dbContext.getStore() || {}).requestId || 'UNKNOWN',
        service: 'AUTH_SERVICE'
    }, async (auditClient) => {
        try {
            // 1. Fetch/Provision User by Email OR Wallet (Authoritative for Web3)
            const normalizedEmail = (email || '').trim().toLowerCase();
            let userResult = await auditClient.query(
              'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(wallet_address) = $2', 
              [normalizedEmail || 'LOG_HANDSHAKE_NO_EMAIL', normalizedWalletAddress]
            );
            let user = userResult.rows.length > 0 ? userResult.rows[0] : null;

            // Auto-Sync Admin via UserService (Uses pre-fetched liveRoleValue)
            if (!user && Number(liveRoleValue) === 3) {
              const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
              user = await UserService.createUser({
                name: 'Genesis Admin',
                email: normalizedEmail || `admin_${normalizedWalletAddress}@bbsns.admin`,
                wallet_address: normalizedWalletAddress,
                role: 'admin',
                is_human_verified: true,
                national_id_hash: nationalIdHash,
                password_hash: 'ADMIN_WEB3_ONLY',
                username: normalizedWalletAddress,
                identity_state: 'ACTIVE'
              }, auditClient);
            }

            if (!user) {
              await auditClient.query('ROLLBACK');
              return { error: 'User profile not found. Please register first.', status: 404 };
            }

            // 🛡️ [Hardening 2.9C-A] Activation Guard for Notaries (Uses pre-fetched liveRoleValue)
            if (Number(liveRoleValue) === 2 || user.role === 'notary') {
              const appCheck = await auditClient.query(
                "SELECT status, is_activated FROM notary_applications WHERE LOWER(wallet_address) = $1",
                [user.wallet_address]
              );
              if (appCheck.rows.length === 0 || appCheck.rows[0].status !== 'activated' || !appCheck.rows[0].is_activated) {
                await auditClient.query('ROLLBACK');
                return { 
                  error: 'Activation required', 
                  details: appCheck.rows.length > 0 ? `Current state: ${appCheck.rows[0].status}` : 'No application found',
                  status: 403 
                };
              }
            }

            // 2. Password Check (Non-Admin)
            // 3. National ID Match
            if (Number(liveRoleValue) !== 3) {
              // 🛡️ [Hardening] Restore strict enforcement for Non-Admins now that middleware is relaxed
              if (!password || !nationalId) {
                await auditClient.query('ROLLBACK');
                return { error: 'Password and National ID are required for secure login', status: 400 };
              }

              const { comparePassword } = require('../utils/password');
              if (!(await comparePassword(password, user.password_hash))) {
                await auditClient.query('ROLLBACK');
                return { error: 'Invalid credentials', status: 401 };
              }
              // 🛡️ [SIGNUP_CONTRACT] National ID Normalization: TRIM -> REMOVE ALL SPACES -> UPPERCASE
              const normalizedNationalId = (nationalId || "").toString().replace(/\s+/g, '').toUpperCase();
              const inputIdHash = crypto.createHash('sha256').update(normalizedNationalId).digest('hex');
              if (user.national_id_hash && user.national_id_hash !== inputIdHash) {
                await auditClient.query('ROLLBACK');
                return { error: 'National ID mismatch', status: 401 };
              }
            }

            // 4. Deterministic Protocol Verification (Atomic Consumption)
            try {
                await verifyProtocolSignature({
                    purpose: 'LOGIN',
                    nonce: (signature_nonce || nonce),
                    wallet: normalizedWalletAddress,
                    signature,
                    rawPayload: {},
                    client: auditClient,
                    requestId: (dbContext.getStore() || {}).requestId || 'LOGIN_HANDSHAKE'
                });
            } catch (authErr) {
                // 🛡️ [Fallback] Smart Recognition of Remote Handshake Challenges
                // If standard protocol fails, check if the nonce is a literal challenge from an active session.
                const fallbackNonce = signature_nonce || nonce;
                const sessionCheck = await auditClient.query(
                  'SELECT challenge FROM remote_auth_sessions WHERE challenge = $1 AND expires_at > NOW()',
                  [fallbackNonce]
                );

                if (sessionCheck.rows.length > 0) {
                  // Valid session found. Perform direct verification against the challenge string.
                  try {
                    const recoveredAddress = ethers.verifyMessage(fallbackNonce, signature);
                    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
                      throw authErr; // Rethrow original mismatch if even the fallback fails
                    }
                    console.log(`[AUTH_FALLBACK_SUCCESS] Authorized via Remote Session: ${fallbackNonce.substring(0,12)}...`);
                  } catch (e) {
                    await auditClient.query('ROLLBACK');
                    return { error: authErr.message, status: 401 };
                  }
                } else {
                  await auditClient.query('ROLLBACK');
                  return { error: authErr.message, status: 401 };
                }
            }

            // 5. Wallet Match Guarantee
            if (user.wallet_address.toLowerCase() !== normalizedWalletAddress) {
                await auditClient.query('ROLLBACK');
                return { error: 'Wallet access mismatch: Signature does not bind to requested identity.', status: 403 };
            }

            await auditClient.query('COMMIT');
            return { user };
        } catch (innerErr) {
            await auditClient.query('ROLLBACK');
            throw innerErr;
        }
    });

    if (result.error) {
        return res.status(result.status).json({ 
            error: result.error, 
            details: result.details,
            code: result.code,
            state: 'AUTH_FAILED' 
        });
    }

    let user = result.user;
    
    // 🛡️ [Hardening 2.9C-A] Global Identity State Guard
    // Only 'ACTIVE' users can proceed. Pending/Rejected/Suspended users are blocked at the perimeter.
    if (user.identity_state !== 'ACTIVE') {
      const errorMsg = user.identity_state === 'PENDING' ? 'Account activation required' : `Account is currently ${user.identity_state.toLowerCase()}`;
      return res.status(403).json({ 
        error: errorMsg,
        state: user.identity_state 
      });
    }

    // MFA assertions are now resolved transactionally inside the cascade context
    // 5. Success
    const token = await signZeroTrustToken(user, normalizedWalletAddress);
    
    // Set secure cross-origin session cookie
    res.cookie('token', token, { 
      ...COOKIE_OPTIONS, 
      maxAge: 12 * 60 * 60 * 1000 
    });

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, walletAddress: normalizedWalletAddress, role: Number(liveRoleValue), identity_state: user.identity_state },
      token
    });

  } catch (error) {
    console.error('[LOGIN_FATAL]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout - Clear Session (Idempotent & Public)
// allowPublic ensures users TRAPPED in a restricted state can still clear their session.
// POST /auth/logout - Clear Session (Idempotent & Public)
router.post('/logout', withDomain('AUTH'), allowPublic, withAction('AUTH_LOGOUT'), withMutation(), requirePrivilege({ capability: 'AUTH_LOGOUT', allowPublic: true }), (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * 🛡️ [Hardening 2.9C-A] Activation Info
 * Purpose: Allows frontend to pre-fetch wallet address bound to an activation token.
 */
// GET /auth/activation-info - Info for application activation
router.get('/activation-info', withDomain('NOTARY'), allowPublic, requirePrivilege({ capability: 'NOTARY_APP_VERIFY', allowPublic: true }), async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const result = await pool.query(
      `SELECT wallet_address, email, name, is_activated, approved_at 
       FROM notary_applications 
       WHERE activation_token = $1`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Invalid activation token' });
    }

    const app = result.rows[0];
    if (app.is_activated) {
      return res.status(400).json({ error: 'Account already activated' });
    }

    res.json({
      wallet: app.wallet_address,
      email: app.email,
      name: app.name
    });
  } catch (err) {
    console.error('[AUTH_ERROR] Activation info fetch failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 🛡️ [Hardening 2.9C-A] Activation Authority
 * Responsibility: Transitions approved application to activated status and provisions user credentials.
 */
// POST /auth/activate - Notary Activation flow
router.post('/activate', withDomain('NOTARY'), allowPublic, withAction('NOTARY_ACTIVATE'), withMutation(), requirePrivilege({ capability: 'NOTARY_ACTIVATE', allowPublic: true }), async (req, res) => {
  const { token, password, signature, nonce } = req.body;
  if (!token || !password || !signature || !nonce) {
    return res.status(400).json({ error: 'Token, password, signature, and nonce are required' });
  }

  try {
    const result = await pool.runWithContext({
      userId: ACTOR_IDS.GUEST,
      reason: 'NOTARY_ACTIVATION',
      route: '/auth/activate',
      requestId: req.requestId || 'ACTIVATE-TRACE',
      service: 'AUTH_SERVICE'
    }, async (auditClient) => {
      await auditClient.query('BEGIN');
      try {
        // 1. Validate Token & Expiry
        const appRes = await auditClient.query(
          `SELECT * FROM notary_applications 
           WHERE activation_token = $1 AND is_activated = false`,
          [token]
        );

        if (appRes.rowCount === 0) {
          throw new Error('Invalid or already used activation token.');
        }

        const application = appRes.rows[0];
        const walletAddress = application.wallet_address;

        // 🛡️ [PHASE 1.1] Cryptographic Handover Verification
        const { verifyProtocolSignature } = require('../utils/identity-crypto');
        try {
          await verifyProtocolSignature({
            purpose: 'NOTARY_ACTIVATE',
            nonce,
            wallet: walletAddress,
            signature,
            rawPayload: { token },
            client: auditClient,
            requestId: req.requestId || 'ACTIVATE-TRACE'
          });
        } catch (sigErr) {
          throw new Error(`Identity verification failed: ${sigErr.message}`);
        }

        // 🛡️ [PHASE 1.2] Enforce Role Isolation (Block Promotion)
        const userResult = await auditClient.query(
          "SELECT id, role FROM users WHERE LOWER(wallet_address) = LOWER($1)",
          [walletAddress]
        );

        if (userResult.rowCount > 0) {
          const error = new Error("Wallet already associated with an existing role. Use a separate wallet for notary registration.");
          error.status = 409;
          throw error;
        }

        // 2. Provision User Credentials
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        let userId;

        const userData = {
          name: application.full_name,
          email: application.email.toLowerCase(),
          wallet_address: walletAddress.toLowerCase(),
          password_hash: hashedPassword,
          role: 'notary',
          identity_state: 'ACTIVE',
          tx_status: 'pending', // 🛡️ [PHASE 2.4] Initial status to trigger sync worker
          national_id_hash: application.national_id_hash,
          is_human_verified: true
        };
          
        const userRecord = await UserService.createUser(userData, auditClient);
        userId = userRecord.id;

        // 3. Finalize Activation
        await auditClient.query(
          `UPDATE notary_applications 
           SET is_activated = true, 
               status = 'activated', 
               user_id = $1,
               activation_token = NULL,
               updated_at = NOW() 
           WHERE id = $2`,
          [userId, application.id]
        );

        await auditClient.query('COMMIT');
        return { success: true };
      } catch (innerErr) {
        await auditClient.query('ROLLBACK');
        throw innerErr;
      }
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ success: true, message: 'Account activated successfully. You can now log in.' });
  } catch (err) {
    console.error('[ACTIVATION_FATAL]', err);
    const status = err.status || 500;
    const message = (status === 500) ? 'Activation failed internally' : err.message;
    res.status(status).json({ error: message });
  }
});

// GET /auth/me - Profile Source of Truth
router.get('/me', allowPublic, simpleRateLimiter(10, 60000), requirePrivilege({ capability: 'AUTH_PRECHECK', allowPublic: true, allowStale: true }), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenCookie = req.cookies.token;
    const token = tokenCookie || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) return res.json({ user: null });

    try {
      const decoded = jwt.verify(token, getJWTSecret());
      const normalizedWallet = decoded.address.toLowerCase();

      const result = await pool.query(
        'SELECT id, username, name, email, wallet_address, role, kyc_verified, liveness_status, identity_state FROM users WHERE LOWER(wallet_address) = $1',
        [normalizedWallet]
      );

      let user = result.rows.length > 0 ? result.rows[0] : null;

      if (!user && decoded.role === 3) {
        await pool.runWithContext({
          userId: ACTOR_IDS.GUEST,
          reason: 'AUTH_ME_AUTO_PROVISION',
          route: req.originalUrl,
          requestId: (dbContext.getStore() || {}).requestId || 'UNKNOWN',
          service: 'AUTH_SERVICE'
        }, async (auditClient) => {
          const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
          await UserService.createUser({
            name: 'Genesis Admin',
            email: `${normalizedWallet}@bbsns.internal`,
            wallet_address: normalizedWallet,
            role: 'admin',
            is_human_verified: true,
            national_id_hash: nationalIdHash,
            password_hash: 'ADMIN_WEB3_ONLY',
            username: normalizedWallet,
            identity_state: 'ACTIVE'
          }, auditClient); // <--- Connection Affinity
        });

        // 🛡️ [Hardening 4.2B] Authoritative Re-Fetch
        const reFetchResult = await pool.query(
          'SELECT id, username, name, email, wallet_address, role, kyc_verified, liveness_status, identity_state FROM users WHERE LOWER(wallet_address) = $1',
          [normalizedWallet]
        );
        user = reFetchResult.rows.length > 0 ? reFetchResult.rows[0] : null;
      }

      if (!user) return res.json({ user: null });

      // 🛡️ [SELF-HEALING] Bunker V3.7: Hardened Authority Rotation
      let refreshedToken = null;
      let zeroTrustStatus = decoded.zeroTrustStatus || 'VERIFIED';
      const requestId = (dbContext.getStore() || {}).requestId || 'UNKNOWN';

      try {
          const config = await ConfigService.getConfig();
          const provider = await ProviderService.getProvider();
          const blockCache = require('../utils/block-cache');
          const cacheResult = await blockCache.getLatest(provider);
          const currentBlock = cacheResult.block;
          
          const age = currentBlock - (decoded.snapshotBlock || 0);
          zeroTrustStatus = (age > 50 || age < 0) ? 'DEGRADED' : 'VERIFIED';
          
          // 🛡️ [OPTIMIZATION] Bunker V3.7: Strict Intent Binding
          // Only rotate if gap is meaningful (>20 blocks) OR session is already DEGRADED.
          const MIN_REFRESH_THRESHOLD = 20;
          const isProactive = req.query.refresh === 'true';
          const needsRefresh = (age > MIN_REFRESH_THRESHOLD) || zeroTrustStatus === 'DEGRADED' || isProactive;

          if (needsRefresh) {
              refreshedToken = await signZeroTrustToken(user, user.wallet_address, zeroTrustStatus, {
                  snapshotBlock: currentBlock,
                  snapshotChainId: Number(config.chainId)
              });
              
              // 🩺 [OBSERVABILITY] Forensic Heal Log
              console.log(JSON.stringify({
                event: "SESSION_HEAL",
                wallet: normalizedWallet,
                request_id: requestId,
                source: req.headers['x-client-source'] || 'web',
                old_block: decoded.snapshotBlock,
                new_block: currentBlock,
                gap: age,
                reason: isProactive ? "PROACTIVE" : "BLOCK_STALE",
                result: "SUCCESS"
              }));
          } else {
             // Refusal Logic: Skip rotation for trivial gaps
             if (isProactive) {
                 console.log(JSON.stringify({
                   event: "SESSION_HEAL",
                   wallet: normalizedWallet,
                   request_id: requestId,
                   reason: "FORCED_REFRESH_DENIED",
                   detail: "Gap below MIN_REFRESH_THRESHOLD",
                   result: "SKIPPED"
                 }));
             }
          }
      } catch (healErr) {
          console.error(JSON.stringify({
             event: "SESSION_HEAL",
             wallet: normalizedWallet,
             request_id: requestId,
             error: healErr.message,
             result: "FAILED"
          }));
      }

      res.json({ 
        user: { ...user, zeroTrustStatus },
        token: refreshedToken || token // Return healed token
      });
    } catch (jwtErr) {
      return res.json({ user: null });
    }
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================= REMOTE AUTH (Desktop App Support) ==================

const { requireUnpaused } = require('../middleware/circuit-breaker');

// POST /auth/remote/session - Creation for desktop app
router.post('/remote/session', withGuestContext, requirePrivilege({ capability: 'AUTH_REMOTE_SESSION', allowPublic: true }), async (req, res) => {
  try {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const challenge = `BBSNS-LOGIN-${crypto.randomBytes(16).toString('hex')}`;
    const session_secret = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); 

    const result = await pool.query(
      'INSERT INTO remote_auth_sessions (challenge, device_id, session_secret, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [challenge, device_id, session_secret, expires_at]
    );

    res.json({ sessionId: result.rows[0].id, sessionSecret: session_secret });
  } catch (error) {
    console.error('[AUTH] Remote session creation failed.');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/remote/status/:sessionId - Retrieval for desktop app
router.get('/remote/status/:sessionId', withGuestContext, requirePrivilege({ capability: 'REMOTE_STATUS_CONSUMPTION', allowPublic: true }), async (req, res) => {
  const { sessionId } = req.params;
  const requestId = req.headers['x-device-id'];
  const requestSecret = req.headers['x-session-secret'];

  if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'Invalid session ID format' });

  return pool.runWithContext({ 
    userId: ACTOR_IDS.GUEST, 
    reason: 'REMOTE_STATUS_CONSUMPTION', 
    route: 'AUTH_REMOTE_STATUS' 
  }, async (auditClient) => {
    try {
      // 1. [LOCK & VALIDATE]
      const result = await auditClient.query(
        'SELECT * FROM remote_auth_sessions WHERE id::text = $1 FOR UPDATE',
        [sessionId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const session = result.rows[0];

      // 2. [EXPIRY GUARD]
      if (new Date(session.expires_at) < new Date()) {
        if (session.status !== 'expired' && session.status !== 'consumed') {
          await auditClient.query("UPDATE remote_auth_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
        }
        if (session.status !== 'consumed') {
          return res.json({ status: 'expired' });
        }
      }

      // 3. [HANDSHAKE DISPATCHER]
      // We decouple PUBLIC READ (Pending/Authorized) from PRIVATE CONSUMPTION (Completed/Consumed)

      // --- [SCOPE A: PUBLIC READ] ---
      if (session.status === 'pending' || session.status === 'authorized') {
          const response = { status: session.status, challenge: session.challenge };
          
          // 🛡️ [Hardening 11.1] Inject Dynamic EIP-712 Domain Authority
          if (process.env.ENABLE_ATOMIC_AUTH === 'true') {
              try {
                  const config = await ConfigService.getConfig();
                  response.handshakeDomain = {
                      name: 'BBSNS_Protocol',
                      version: '2',
                      chainId: config.chainId,
                      verifyingContract: config.contracts.documentRegistry
                  };
                  response.handshakeTypes = {
                      Handshake: [
                          { name: 'action', type: 'string' },
                          { name: 'sessionId', type: 'string' },
                          { name: 'challenge', type: 'string' },
                          { name: 'timestamp', type: 'uint256' }
                      ]
                  };
              } catch (e) {
                  console.warn('[AUTH_WARN] Failed to inject handshake domain authority:', e.message);
              }
          }
          
          return res.json(response);
      }

      // --- [SCOPE B: PRIVATE CONSUMPTION (Triple-Bind Enforcement)] ---
      // At this stage, the session has been signed/completed or already consumed.
      // We REQUIRE original hardware proof (Device ID + Session Secret).

      const isLegacy = !session.session_secret;
      const deviceMatch = session.device_id === requestId;
      const secretMatch = isLegacy || session.session_secret === requestSecret;

      if (!deviceMatch || !secretMatch) {
         console.warn(`[SECURITY] Identity Handover REJECTED: Proof Mismatch (sid=${sessionId.substring(0,8)})`);
         return res.status(403).json({ error: 'Triple-Bind proof mismatch. Identity handover failed.' });
      }

      // 4. [ATOMIC CONSUMPTION]
      if (session.status === 'completed') {
        const userId = session.user_id;
        if (!userId) return res.status(500).json({ error: 'Session completed but missing Identity Data' });

        const userRes = await auditClient.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User no longer exists' });
        const user = userRes.rows[0];

        // Mark as consumed
        const updateRes = await auditClient.query(
          "UPDATE remote_auth_sessions SET status = 'consumed', authorized_at = NOW() WHERE id = $1 AND status = 'completed' RETURNING *",
          [sessionId]
        );

        if (updateRes.rowCount === 0) {
           throw new Error('Consumption race condition observed');
        }

        const token = await signZeroTrustToken(user, user.wallet_address, 'VERIFIED', {
            source: 'remote_auth',
            sid: sessionId,
            binding_iat: Date.now()
        });

        return res.json({ 
            status: 'completed', 
            token, 
            user: { id: user.id, email: user.email, walletAddress: user.wallet_address, role: user.role } 
        });
      }

      // 5. [IDEMPOTENCY]
      if (session.status === 'consumed') {
         const userRes = await auditClient.query('SELECT * FROM users WHERE id = $1', [session.user_id]);
         const user = userRes.rows[0];
         
         const token = await signZeroTrustToken(user, user.wallet_address, 'VERIFIED', {
             source: 'remote_auth',
             sid: sessionId,
             binding_iat: Date.now()
         });

         return res.json({ 
             status: 'completed', 
             token, 
             user: { id: user.id, email: user.email, walletAddress: user.wallet_address, role: user.role } 
         });
      }

      // 6. [FALLBACK]
      res.json({ status: session.status, challenge: session.challenge });
    } catch (error) {
      console.error('[AUTH] Remote status retrieval failed:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

/**
 * 🛡️ [Hardening 10.2] Identity Binding Completion
 * Moves session from 'pending' -> 'completed' by verifying current web session identity via Authorization Header.
 */
// POST /auth/remote/complete - Remote binding completion
router.post('/remote/complete', allowPublic, requirePrivilege({ capability: 'REMOTE_IDENTITY_BINDING', allowPublic: true }), async (req, res) => {
    try {
        const { sessionId } = req.body;
        const authHeader = req.headers.authorization;
        
        if (!sessionId || !authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(400).json({ error: 'Missing Session ID or Authorization Header' });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, getJWTSecret());
        } catch (e) {
            return res.status(401).json({ error: 'Invalid or Expired Identity Token' });
        }

        const walletAddress = decoded.address.toLowerCase();

        // 🛡️ Transactional Lock to prevent race conditions
        const result = await pool.runWithContext({
            userId: decoded.id,
            reason: 'REMOTE_IDENTITY_BINDING',
            route: req.originalUrl,
            requestId: req.requestId || 'UNKNOWN',
            service: 'AUTH_SERVICE'
        }, async (auditClient) => {
            await auditClient.query('BEGIN');

            const sessionRes = await auditClient.query(
                "SELECT * FROM remote_auth_sessions WHERE id::text = $1 AND expires_at > NOW() FOR UPDATE",
                [sessionId]
            );

            if (sessionRes.rows.length === 0) {
                await auditClient.query('ROLLBACK');
                return { error: 'Session not found or expired.', status: 404 };
            }

            const session = sessionRes.rows[0];

            // 🛡️ [Hardening] State Machine Enforcement: MUST have been 'authorized' first
            // This prevents skipping the cryptographic proof of identity.
            if (session.status !== 'authorized') {
                await auditClient.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [sessionId]);
                await auditClient.query('COMMIT');
                return { error: `Illegal transition: Handshake must be 'authorized' before completion. Current state: ${session.status}`, status: 403 };
            }

            // 🛡️ Identity Binding Enforcement: Must match intended wallet
            if (session.wallet_address && session.wallet_address.toLowerCase() !== walletAddress) {
                await auditClient.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [sessionId]);
                await auditClient.query('COMMIT');
                return { error: 'Identity Binding Mismatch: Wallet does not match handshake request.', status: 403 };
            }

            // [SUCCESS] Complete the Binding
            await auditClient.query(
                "UPDATE remote_auth_sessions SET status = 'completed', user_id = $1, wallet_address = $2, authorized_at = NOW() WHERE id = $3",
                [decoded.id, walletAddress, sessionId]
            );

            await auditClient.query('COMMIT');
            return { success: true };
        });

        if (result.error) {
            // 🛡️ [Hardening] Record Internal/Audit failures as explicitly 'failed' if they were already locked
            if (result.status === 403 || result.status === 400) {
                 await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [sessionId]);
            }
            return res.status(result.status).json({ error: result.error });
        }
        res.json({ message: 'Identity bound successfully.' });

    } catch (err) {
        console.error('[REMOTE_COMPLETE_FATAL]', err);
        // Ensure failure is recorded
        if (req.body.sessionId && isValidUUID(req.body.sessionId)) {
            await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [req.body.sessionId]).catch(() => {});
        }
        res.status(500).json({ error: 'Internal system error during identity binding' });
    }
});

/**
 * 🛡️ [Hardening 11.2] Atomic Single-Signature Handshake
 * Consolidates Identity Verification + Handshake Authorization into a single EIP-712 prompt.
 */
// POST /auth/remote/atomic-bind - Consolidated atomic auth
router.post('/remote/atomic-bind', allowPublic, requirePrivilege({ capability: 'REMOTE_IDENTITY_BINDING', allowPublic: true }), async (req, res) => {
    if (process.env.ENABLE_ATOMIC_AUTH !== 'true') {
        return res.status(501).json({ error: 'Atomic Authentication is not enabled on this authority.' });
    }

    try {
        const { sessionId, signature, walletAddress, timestamp } = req.body;

        if (!sessionId || !signature || !walletAddress || !timestamp) {
            return res.status(400).json({ error: 'Missing required binding parameters' });
        }

        if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

        // 1. [Hardening] Timestamp skew and expiry protection (+/- 60s skew + 300s TTL)
        const now = Math.floor(Date.now() / 1000);
        const diff = Math.abs(now - Number(timestamp));
        if (diff > 360) {
            return res.status(401).json({ error: 'Handshake expired or clock skew too high. Please ensure your device time is correct.' });
        }

        const result = await pool.runWithContext({
            userId: ACTOR_IDS.GUEST,
            reason: 'REMOTE_ATOMIC_BIND',
            route: req.originalUrl
        }, async (auditClient) => {
            await auditClient.query('BEGIN');

            const sessionRes = await auditClient.query(
                'SELECT * FROM remote_auth_sessions WHERE id::text = $1 AND expires_at > NOW() FOR UPDATE',
                [sessionId]
            );

            if (sessionRes.rows.length === 0) {
                await auditClient.query('ROLLBACK');
                return { error: 'Session not found or expired', status: 404 };
            }

            const session = sessionRes.rows[0];

            if (session.status !== 'pending') {
                await auditClient.query('ROLLBACK');
                return { error: `Session already in state: ${session.status}`, status: 403 };
            }

            // 2. [CRYPTO] Recover EIP-712 Wallet Identity
            let recoveredAddress;
            try {
                const config = await ConfigService.getConfig();
                const domain = {
                    name: 'BBSNS_Protocol',
                    version: '2',
                    chainId: config.chainId,
                    verifyingContract: config.contracts.documentRegistry
                };
                const types = {
                    Handshake: [
                        { name: 'action', type: 'string' },
                        { name: 'sessionId', type: 'string' },
                        { name: 'challenge', type: 'string' },
                        { name: 'timestamp', type: 'uint256' }
                    ]
                };
                const message = {
                    action: 'Remote Login Authorization',
                    sessionId: sessionId,
                    challenge: session.challenge,
                    timestamp: Number(timestamp)
                };

                recoveredAddress = ethers.verifyTypedData(domain, types, message, signature);
            } catch (e) {
                await auditClient.query('ROLLBACK');
                return { error: 'Cryptographic identity verification failed', status: 401 };
            }

            if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
                await auditClient.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [sessionId]);
                await auditClient.query('COMMIT');
                return { error: 'Identity Mismatch: Signer does not match provided wallet.', status: 403 };
            }

            // 3. Resolve Database User
            const userRes = await auditClient.query(
                'SELECT id FROM users WHERE LOWER(wallet_address) = $1 AND identity_state = $2',
                [walletAddress.toLowerCase(), 'ACTIVE']
            );

            if (userRes.rows.length === 0) {
                await auditClient.query('ROLLBACK');
                return { error: 'Account not found or inactive. Please register on the web app first.', status: 404 };
            }

            const userId = userRes.rows[0].id;

            // 4. [ATOMIC UPDATE] Complete the Handshake
            const oneTimeCode = crypto.randomBytes(32).toString('hex');
            const codeExpiry = new Date(Date.now() + 60 * 1000);

            await auditClient.query(
                `UPDATE remote_auth_sessions 
                 SET status = 'completed', 
                     user_id = $1, 
                     wallet_address = $2, 
                     one_time_code = $3, 
                     code_expires_at = $4,
                     authorized_at = NOW() 
                 WHERE id = $5`,
                [userId, walletAddress.toLowerCase(), oneTimeCode, codeExpiry, sessionId]
            );

            await auditClient.query('COMMIT');
            return { success: true };
        });

        if (result.error) return res.status(result.status).json({ error: result.error });

        res.json({ message: 'Atomic Handshake Successful.' });

    } catch (err) {
        console.error('[REMOTE_ATOMIC_FATAL]', err);
        res.status(500).json({ error: 'Internal system error during atomic binding' });
    }
});

// POST /auth/remote/authorize - Web-based approval for desktop
router.post('/remote/authorize', withGuestContext, simpleRateLimiter(5, 60000), requirePrivilege({ capability: 'GOV_REMOTE_AUTHORIZE', allowPublic: true }), async (req, res) => {
  try {
    const { sessionId, signature, walletAddress } = req.body;
    if (!sessionId || !walletAddress || !signature) return res.status(400).json({ error: 'Missing data' });
    if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'Invalid format' });

    const sessionResult = await pool.query('SELECT * FROM remote_auth_sessions WHERE id::text = $1', [sessionId]);
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const session = sessionResult.rows[0];
    if (session.status !== 'pending') return res.status(400).json({ error: `Session ${session.status}` });
    if (new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Session expired' });

    const normalizedWalletAddress = walletAddress.toLowerCase();
    let recoveredAddress;
    try {
      if (session.challenge.includes('"domain"') && session.challenge.includes('"message"')) {
        const payload = JSON.parse(session.challenge);
        recoveredAddress = ethers.verifyTypedData(payload.domain, payload.types, payload.message, signature);
      } else {
        recoveredAddress = ethers.verifyMessage(session.challenge, signature);
      }
    } catch (e) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
       await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [sessionId]);
       return res.status(401).json({ error: 'Address mismatch' });
    }

    // 🛡️ [SECURITY] ONE-TIME CODE GENERATION (NO JWT IN POLL)
    const oneTimeCode = crypto.randomBytes(32).toString('hex');
    const codeExpiry = new Date(Date.now() + 60 * 1000); // 60s TTL

    await pool.query(
      "UPDATE remote_auth_sessions SET status = 'authorized', wallet_address = $1, one_time_code = $2, code_expires_at = $3, authorized_at = NOW() WHERE id = $4", 
      [normalizedWalletAddress, oneTimeCode, codeExpiry, sessionId]
    );

    res.json({ message: 'Authorized successfully. Returning to app...' });
  } catch (error) {
    console.error('[REMOTE_AUTHORIZE_FATAL]', error);
    if (req.body.sessionId && isValidUUID(req.body.sessionId)) {
        await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id = $1", [req.body.sessionId]).catch(() => {});
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🛡️ [SECURITY] Hardened Atomic Token Exchange (Transactional with Row Lock)
// POST /auth/remote/exchange - Desktop app OTC exchange
router.post('/remote/exchange', withGuestContext, simpleRateLimiter(5, 60000), requirePrivilege({ capability: 'REMOTE_STATUS_CONSUMPTION', allowPublic: true }), async (req, res) => {
  try {
    const { sessionId, code, device_id } = req.body;
    const result = await pool.runWithContext({
      userId: ACTOR_IDS.SYSTEM,
      reason: 'REMOTE_ADMIN_SYNC',
      route: req.originalUrl,
      requestId: req.requestId || 'UNKNOWN',
      service: 'AUTH_SERVICE',
      contextType: 'SYSTEM'
    }, async (auditClient) => {
      await auditClient.query('BEGIN');
      try {
        // 1. [VALIDATE FIRST] SELECT FOR UPDATE: Lock the session row to prevent micro-races
        const sessionRes = await auditClient.query(
          `SELECT wallet_address, code_consumed, code_expires_at 
           FROM remote_auth_sessions 
           WHERE id::text = $1 AND one_time_code = $2 AND device_id = $3
           FOR UPDATE`,
          [sessionId, code, device_id]
        );

        if (sessionRes.rows.length === 0) {
          await auditClient.query('ROLLBACK');
          console.warn(`[SECURITY] Exchange attempt REJECTED: Invalid markers or Device Mismatch.`);
          return { error: 'Invalid exchange code', status: 403 };
        }

        const { wallet_address, code_consumed, code_expires_at } = sessionRes.rows[0];

        // 2. Validate session state
        if (code_consumed) {
          await auditClient.query('ROLLBACK');
          return { error: 'Code already consumed', status: 403 };
        }
        if (new Date(code_expires_at) < new Date()) {
          await auditClient.query('ROLLBACK');
          return { error: 'Code expired', status: 403 };
        }

        const normalizedWalletAddress = wallet_address.toLowerCase();
        let userResult = await auditClient.query('SELECT id, wallet_address, role FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
        let user = userResult.rows[0];
        
        let roleData = null;
        let isBanned = false;
        let zeroTrustStatus = 'VERIFIED';

        try {
          const config = await ConfigService.getConfig();
          const provider = await ProviderService.getProvider();
          const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)", "function isBanned(address) view returns (bool)"], provider);
          
          const chainData = await executeWithRetry(async () => {
            const [r, b] = await Promise.all([
              registry.getUserRole(normalizedWalletAddress), 
              registry.isBanned(normalizedWalletAddress)
            ]);
            return { role: Number(r), banned: !!b };
          }, 3, "EXCHANGE_CHAIN_CHECK");

          roleData = chainData.role;
          isBanned = chainData.banned;

          if (isBanned) {
            await auditClient.query('ROLLBACK');
            return { error: 'Banned', status: 403 };
          }
        } catch (chainErr) {
          console.warn(`[AUTH_WARN] RPC Unreachable during exchange. Falling back to DB authority for ${normalizedWalletAddress}. Detail: ${chainErr.message}`);
          zeroTrustStatus = 'DEGRADED';
          
          if (!user) {
            await auditClient.query('ROLLBACK');
            return { error: 'Service Unavailable: Local identity missing and blockchain unreachable.', status: 503 };
          }
          
          const ROLE_MAP = { 'none': 0, 'user': 1, 'notary': 2, 'admin': 3 };
          roleData = ROLE_MAP[user.role] || (isNaN(Number(user.role)) ? 1 : Number(user.role));
        }

        // Auto-Sync Admin Profile if missing
        if (!user && zeroTrustStatus === 'VERIFIED' && Number(roleData) === 3) {
          const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
          user = await UserService.createUser({
            name: 'Genesis Admin',
            email: `${normalizedWalletAddress}@bbsns.internal`,
            wallet_address: normalizedWalletAddress,
            role: 'admin',
            is_human_verified: true,
            national_id_hash: nationalIdHash,
            password_hash: 'ADMIN_WEB3_ONLY',
            username: normalizedWalletAddress,
            identity_state: 'ACTIVE'
          }, auditClient);
        }

        if (!user) {
          await auditClient.query('ROLLBACK');
          return { error: 'Account not found', status: 404 };
        }

        // 4. [MUTATE SECOND] Consume code
        await auditClient.query('UPDATE remote_auth_sessions SET code_consumed = TRUE WHERE id::text = $1', [sessionId]);

        const token = await signZeroTrustToken(user, normalizedWalletAddress, zeroTrustStatus);

        // 5. Persist token and COMMIT
        await auditClient.query("UPDATE remote_auth_sessions SET token = $1 WHERE id::text = $2", [token, sessionId]);
        await auditClient.query('COMMIT');

        return { 
          token, 
          user: { id: user.id, walletAddress: normalizedWalletAddress, role: Number(roleData) },
          zeroTrustStatus
        };
      } catch (innerErr) {
        await auditClient.query('ROLLBACK');
        throw innerErr;
      }
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    
    res.json({ 
      token: result.token, 
      user: result.user,
      zeroTrustStatus: result.zeroTrustStatus,
      walletVerificationPending: result.zeroTrustStatus === 'DEGRADED'
    });
  } catch (error) {
    console.error('[REMOTE_EXCHANGE_FATAL]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 🛡️ [SELF-HEALING] POST /auth/remote/refresh-zero-trust
 * Responsibility: Upgrade a DEGRADED session to VERIFIED if RPC connectivity returns.
 * Rule: Server is the SOLE authority for upgrades.
 */
// POST /auth/remote/refresh-zero-trust - Session upgrade
router.post('/remote/refresh-zero-trust', allowPublic, simpleRateLimiter(2, 60000), requirePrivilege({ capability: 'AUTH_LOGIN', allowStale: true }), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : (req.cookies?.token);

    if (!token) return res.status(401).json({ status: 'REAUTH_REQUIRED', error: 'Missing session token' });

    let decoded;
    try {
      decoded = jwt.verify(token, getJWTSecret());
    } catch (err) {
      return res.status(401).json({ status: 'REAUTH_REQUIRED', error: 'Invalid or expired token' });
    }

    const { address, id } = decoded;
    const normalizedAddress = address.toLowerCase();
    const requestId = (dbContext.getStore() || {}).requestId || 'UNKNOWN';

    // 1. Idempotency: If already verified and block gap is fresh, no need to upgrade
    let currentBlock;
    try {
        const config = await ConfigService.getConfig();
        const provider = await ProviderService.getProvider();
        currentBlock = await provider.getBlockNumber();
        const gap = currentBlock - (decoded.snapshotBlock || 0);
        
        if (decoded.zeroTrustStatus === 'VERIFIED' && gap < 20) {
          return res.json({ status: 'VERIFIED', message: 'Session already verified' });
        }
    } catch(e) { /* proceed to on-chain check */ }

    // 2. Definitive On-Chain Verification (Server Authority)
    try {
      const config = await ConfigService.getConfig();
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)", "function isBanned(address) view returns (bool)"], provider);

      const chainData = await executeWithRetry(async () => {
        const [r, b] = await Promise.all([
          registry.getUserRole(normalizedAddress), 
          registry.isBanned(normalizedAddress)
        ]);
        return { role: Number(r), banned: !!b };
      }, 3, "REFRESH_CHAIN_CHECK");

      if (chainData.banned) {
        return res.status(403).json({ status: 'BANNED', error: 'Account banned' });
      }

      // 3. Issue Fresh VERIFIED Token
      const userResult = await pool.query('SELECT id, role, wallet_address FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) return res.status(404).json({ status: 'REAUTH_REQUIRED', error: 'User not found' });

      const newToken = await signZeroTrustToken(userResult.rows[0], normalizedAddress, 'VERIFIED');

      // 🩺 [OBSERVABILITY] Forensic Heal Log
      console.log(JSON.stringify({
        event: "SESSION_HEAL",
        wallet: normalizedAddress,
        request_id: requestId,
        source: "desktop_worker",
        reason: "RECOVERY_HANDSHAKE",
        result: "SUCCESS"
      }));

      return res.json({ 
        status: 'VERIFIED', 
        token: newToken,
        user: { id, walletAddress: normalizedAddress, role: chainData.role } 
      });

    } catch (rpcErr) {
      console.error(JSON.stringify({
         event: "SESSION_HEAL",
         wallet: normalizedAddress,
         request_id: requestId,
         error: rpcErr.message,
         result: "FAILED"
      }));
      return res.json({ status: 'DEGRADED', message: 'Blockchain still unreachable' });
    }
  } catch (err) {
    console.error('[AUTH_REFRESH_FATAL]', err);
    res.status(500).json({ status: 'ERROR', error: 'Internal server error' });
  }
});

module.exports = router;
