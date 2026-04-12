const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db/index');
const crypto = require('crypto');
const { generateNonce } = require('../utils/nonce');
const { ethers } = require('ethers');
const ConfigService = require('../services/config.service');

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

const { requirePrivilege, allowPublic, ROLES, RISK_LEVELS } = require('../middleware/actor');
const { requireSystemActivated } = require('../middleware/activation');
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
 * 🛡️ [RESILIENCE] Retry Logic with Exponential Backoff
 */
const executeWithRetry = async (fn, retries = 3, label = "EXECUTE") => {
  for (let i = 0; i < retries; i++) {
    try {
      return await withTimeout(fn(), 1500, `${label}_ATTEMPT_${i+1}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      const delay = 200 * (i + 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

// Zero-Trust JWT Helper
async function signZeroTrustToken(user, walletAddress, zeroTrustStatus = 'VERIFIED') {
  if (!user || !walletAddress) throw new Error("Missing user data for token signing");
  
  let snapshotBlock = 0;
  let snapshotChainId = 0;

  try {
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
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
        issuedAt: Date.now()
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
router.post('/pre-check', allowPublic, async (req, res) => {
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

// POST /auth/nonce - Generate nonce for wallet authentication
router.post('/nonce', allowPublic, simpleRateLimiter(5, 60000), async (req, res) => {
  try {
    const { wallet_address, purpose } = req.body;
    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    const normalizedWalletSize = wallet_address.toLowerCase();
    const noncePurpose = purpose || 'LOGIN';

    // 1. Invalidate ALL previous unused nonces for this wallet + purpose
    await pool.query(
      'UPDATE wallet_nonces SET used_at = NOW() WHERE LOWER(wallet_address) = $1 AND purpose = $2 AND used_at IS NULL',
      [normalizedWalletSize, noncePurpose]
    );

    // 2. Generate and store new nonce
    const nonce = generateNonce();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await pool.query(
      'INSERT INTO wallet_nonces (wallet_address, nonce, expiry, purpose) VALUES ($1, $2, $3, $4)',
      [normalizedWalletSize, nonce, expiry, noncePurpose]
    );

    // 3. Define message template based on purpose
    let message_template;
    if (noncePurpose === 'NOTARY_BIND' || noncePurpose === 'NOTARY_ONBOARD') {
      message_template = `Notary binding request for ${APP_NAME}: ${nonce}`;
    } else {
      message_template = `Login request for ${APP_NAME}: ${nonce}`;
    }

    res.json({
      nonce,
      expiry: expiry.toISOString(),
      message_template
    });
  } catch (error) {
    console.error('Error generating nonce:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/system-status - Required for Desktop App startup check
router.get('/system-status', allowPublic, async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // 🛡️ [RESILIENCE] Protected blockchain verification
    let adminCount = 1; // Resilient default (Admin exists)
    let activated = true; // Resilient default (System active)
    let isChainUp = true;

    try {
      const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function adminCount() view returns (uint256)"], provider);
      const genesisContract = new ethers.Contract(config.contracts.genesisActivation, ["function activated() view returns (bool)"], provider);

      const [chainAdminCount, chainActivated] = await Promise.all([
        registry.adminCount().catch(() => 1n),
        genesisContract.activated().catch(() => true)
      ]);
      adminCount = Number(chainAdminCount);
      activated = !!chainActivated;
    } catch (rpcErr) {
      console.warn("[AUTH_WARN] RPC query failed for system-status:", rpcErr.message);
      isChainUp = false;
    }

    // DB Check (Mandatory Authority)
    const dbUserResult = await pool.query('SELECT COUNT(*) FROM users');

    res.json({ 
      activated, 
      adminCount,
      dbUserCount: parseInt(dbUserResult.rows[0].count),
      status: isChainUp ? "ok" : "degraded",
      health: { chain: isChainUp }
    });
  } catch (error) {
    console.error('[AUTH_FATAL] Status resolution failed:', error);
    // 🛡️ Fail-Safe Minimal Response to prevent App crash
    res.status(200).json({ 
        activated: true, 
        status: "degraded", 
        error: "Connectivity unstable",
        dbUserCount: 0 
    });
  }
});

// POST /auth/genesis/onboard - The ONLY mutated path for Admin creation
router.post('/genesis/onboard', allowPublic, simpleRateLimiter(10, 3600000), async (req, res) => {
  try {
    const { fullName, email, walletAddress, nationalId, signature, nonce } = req.body;

    if (!fullName || !walletAddress || !nationalId || !signature || !nonce) {
      return res.status(400).json({ error: 'Missing onboarding metadata' });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // 1. Fetch Nonce
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'GENESIS_ONBOARD' 
       AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWalletAddress]
    );

    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== nonce) {
      return res.status(401).json({ error: 'Invalid or expired onboarding session' });
    }

    // 2. Guard: No Profile
    const checkUser = await pool.query('SELECT id FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    if (checkUser.rows.length > 0) return res.status(400).json({ error: 'Profile already exists' });

    // 3. Sig Verification
    const message = `Login request for ${APP_NAME}: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
      return res.status(401).json({ error: 'Cryptographic signature verification failed' });
    }

    // 4. On-Chain Check
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
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
    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);
    const nationalIdHash = crypto.createHash('sha256').update(nationalId).digest('hex');
    
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
    });

    res.json({ success: true, message: 'Genesis Admin Onboarded Successfully' });
  } catch (error) {
    console.error('Onboarding failed:', error);
    res.status(500).json({ error: 'Onboarding failed internally' });
  }
});

// POST /auth/notary/onboard - Explicit path for on-chain Notaries to sync to DB
router.post('/notary/onboard', allowPublic, simpleRateLimiter(5, 3600000), async (req, res) => {
  try {
    const { fullName, walletAddress, nonce, signature } = req.body;

    if (!fullName || !walletAddress || !nonce || !signature) {
      return res.status(400).json({ error: 'Missing Notary onboarding data' });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // 1. Verify Nonce
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'NOTARY_ONBOARD' 
       AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWalletAddress]
    );

    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== nonce) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // 2. Sig Verification
    const message = `Login request for ${APP_NAME}: ${nonce}`;
    if (ethers.verifyMessage(message, signature).toLowerCase() !== normalizedWalletAddress) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // 3. On-Chain Check
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)"], provider);
    const liveRole = await registry.getUserRole(normalizedWalletAddress);

    if (Number(liveRole) !== 2) return res.status(403).json({ error: 'Not authorized role' });

    // 4. Create Profile via UserService
    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);
    await UserService.createUser({
      name: fullName,
      wallet_address: normalizedWalletAddress,
      role: 'notary',
      is_human_verified: true,
      password_hash: 'NOTARY_WEB3_ONLY',
      identity_state: 'ACTIVE'
    });

    res.json({ success: true, message: 'Notary profile created successfully' });
  } catch (error) {
    console.error('Notary onboarding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login - Secure Login
router.post('/login', allowPublic, async (req, res) => {
  try {
    const { email, password, walletAddress, signature, nationalId, signature_nonce } = req.body;
    const normalizedWalletAddress = (walletAddress || "").trim().toLowerCase();

    console.log(`[LOGIN_DEBUG] Attempting login for wallet: "${normalizedWalletAddress}"`);

    if (!walletAddress || !signature || !signature_nonce) {
      return res.status(400).json({ error: 'Wallet address, signature, and nonce are required' });
    }

    // 1. Wallet Signature Verification
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'LOGIN' AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWalletAddress]
    );

    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== signature_nonce) {
      return res.status(400).json({ error: 'Session expired. Please request a new nonce.' });
    }

    const nonce = nonceResult.rows[0].nonce;
    const message = `Login request for ${APP_NAME}: ${nonce}`;
    if (ethers.verifyMessage(message, signature).toLowerCase() !== normalizedWalletAddress) {
      return res.status(401).json({ error: 'Wallet signature verification failed' });
    }

    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);

    // 2. Fetch/Provision User
    const userResult = await pool.query('SELECT * FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    let user = userResult.rows.length > 0 ? userResult.rows[0] : null;

    // 3. On-Chain Authority & Activation Guard
    let liveRoleValue, liveBanned;
    try {
      const liveConfig = await ConfigService.getConfig();
      const provider = new ethers.JsonRpcProvider(liveConfig.rpcUrl);
      const notaryRegistryAbi = ["function getUserRole(address) view returns (uint8)", "function isBanned(address) view returns (bool)"];
      const notaryRegistry = new ethers.Contract(liveConfig.contracts.notaryRegistry, notaryRegistryAbi, provider);

      [liveRoleValue, liveBanned] = await Promise.all([
        notaryRegistry.getUserRole(normalizedWalletAddress),
        notaryRegistry.isBanned(normalizedWalletAddress)
      ]);

      if (liveBanned) return res.status(403).json({ error: 'Account is banned on-chain' });

      // 🛡️ [Hardening 2.9C-A] Activation Guard for Notaries
      if (Number(liveRoleValue) === 2) {
        const appCheck = await pool.query(
          "SELECT status, is_activated FROM notary_applications WHERE LOWER(wallet_address) = $1",
          [normalizedWalletAddress]
        );
        if (appCheck.rows.length === 0 || appCheck.rows[0].status !== 'activated' || !appCheck.rows[0].is_activated) {
          return res.status(403).json({ 
            error: 'Activation required', 
            details: appCheck.rows.length > 0 ? `Current state: ${appCheck.rows[0].status}` : 'No application found' 
          });
        }
      }

      // Auto-Sync Admin via UserService
      if (!user && Number(liveRoleValue) === 3) {
        console.log(`[SECURITY] Auto-Syncing Admin | wallet=${normalizedWalletAddress}`);
        const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
        user = await UserService.createUser({
          name: 'Genesis Admin',
          wallet_address: normalizedWalletAddress,
          role: 'admin',
          is_human_verified: true,
          national_id_hash: nationalIdHash,
          password_hash: 'ADMIN_WEB3_ONLY',
          username: normalizedWalletAddress,
          identity_state: 'ACTIVE'
        });
      }
    } catch (chainErr) {
      console.error("[LOGIN_CHAIN_ERROR]", chainErr.message);
      if (!user) return res.status(503).json({ error: 'Unable to verify identity' });
    }

    if (!user) return res.status(404).json({ error: 'User profile not found' });
    
    // 🛡️ [Hardening 2.9C-A] Global Identity State Guard
    // Only 'ACTIVE' users can proceed. Pending/Rejected/Suspended users are blocked at the perimeter.
    if (user.identity_state !== 'ACTIVE') {
      const errorMsg = user.identity_state === 'PENDING' ? 'Account activation required' : `Account is currently ${user.identity_state.toLowerCase()}`;
      return res.status(403).json({ 
        error: errorMsg,
        state: user.identity_state 
      });
    }

    // 4. Identity Checks (Non-Admin)
    const isAdmin = Number(liveRoleValue) === 3;
    if (!isAdmin) {
      if (!email || !password || !nationalId) {
        return res.status(400).json({ error: 'Email, Password, and National ID are required' });
      }
      const { comparePassword } = require('../utils/password');
      if (!(await comparePassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const inputIdHash = crypto.createHash('sha256').update(nationalId).digest('hex');
      if (user.national_id_hash && user.national_id_hash !== inputIdHash) {
        return res.status(401).json({ error: 'National ID mismatch' });
      }
    }

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
router.post('/logout', allowPublic, (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * 🛡️ [Hardening 2.9C-A] Activation Authority
 * Responsibility: Transitions approved application to activated status and provisions user credentials.
 */
router.post('/activate', allowPublic, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate Token & Expiry
    const appRes = await client.query(
      `SELECT * FROM notary_applications 
       WHERE activation_token = $1 
       AND activation_expires_at > NOW() 
       AND is_activated = false`,
      [token]
    );

    if (appRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired activation token' });
    }

    const app = appRes.rows[0];

    // 2. Provision User (Lazy Creation)
    const { hashPassword } = require('../utils/password');
    const hashedPassword = await hashPassword(password);
    
    // Check if user already exists (Promotion case)
    let userResult = await client.query('SELECT id FROM users WHERE LOWER(wallet_address) = $1', [app.wallet_address.toLowerCase()]);
    let userId;

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      // Promote existing user
      await client.query(
        "UPDATE users SET role = 'notary', password_hash = $1, identity_state = 'ACTIVE', updated_at = NOW() WHERE id = $2",
        [hashedPassword, userId]
      );
    } else {
      // Create new user
      const userData = {
        username: app.email,
        name: app.full_name,
        email: app.email,
        password_hash: hashedPassword,
        wallet_address: app.wallet_address.toLowerCase(),
        national_id_hash: app.national_id_hash,
        role: 'notary',
        identity_state: 'ACTIVE',
        is_human_verified: true
      };
      
      const userRecord = await UserService.createUser(userData);
      userId = userRecord.id;
    }

    // 3. Finalize Activation
    await client.query(
      `UPDATE notary_applications 
       SET is_activated = true, 
           status = 'activated', 
           user_id = $1,
           activation_token = NULL,
           updated_at = NOW() 
       WHERE id = $2`,
      [userId, app.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Account activated successfully. You can now log in.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ACTIVATION_FATAL]', err);
    res.status(500).json({ error: 'Activation failed internally' });
  } finally {
    client.release();
  }
});

// GET /auth/me - Profile Source of Truth
router.get('/me', allowPublic, async (req, res) => {
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
        const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
        user = await UserService.createUser({
          name: 'Genesis Admin',
          email: `${normalizedWallet}@bbsns.internal`,
          wallet_address: normalizedWallet,
          role: 'admin',
          is_human_verified: true,
          national_id_hash: nationalIdHash,
          password_hash: 'ADMIN_WEB3_ONLY',
          username: normalizedWallet,
          identity_state: 'ACTIVE'
        });
      }

      if (!user) return res.json({ user: null });
      res.json({ 
        user: { 
          ...user, 
          zeroTrustStatus: decoded.zeroTrustStatus || 'VERIFIED' 
        } 
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

router.post('/remote/session', allowPublic, requireSystemActivated, async (req, res) => {
  try {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const challenge = `BBSNS-LOGIN-${crypto.randomBytes(16).toString('hex')}`;
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); 

    const result = await pool.query(
      'INSERT INTO remote_auth_sessions (challenge, device_id, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [challenge, device_id, expires_at]
    );

    res.json({ sessionId: result.rows[0].id });
  } catch (error) {
    console.error('[AUTH] Remote session creation failed.');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/remote/status/:sessionId', allowPublic, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!isValidUUID(sessionId)) return res.status(400).json({ error: 'Invalid session ID format' });
    
    const result = await pool.query('SELECT * FROM remote_auth_sessions WHERE id::text = $1', [sessionId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const session = result.rows[0];
    if (session.status === 'pending' && new Date(session.expires_at) < new Date()) {
      await pool.query("UPDATE remote_auth_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
      return res.json({ status: 'expired' });
    }

    res.json({ status: session.status, challenge: session.challenge, wallet_address: session.wallet_address, one_time_code: session.one_time_code });
  } catch (error) {
    console.error('[AUTH] Remote status retrieval failed.');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/remote/authorize', allowPublic, requireSystemActivated, simpleRateLimiter(5, 60000), async (req, res) => {
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

    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) return res.status(401).json({ error: 'Address mismatch' });

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🛡️ [SECURITY] Hardened Atomic Token Exchange (Transactional with Row Lock)
router.post('/remote/exchange', allowPublic, requireSystemActivated, simpleRateLimiter(5, 60000), async (req, res) => {
  const client = await pool.connect();
  try {
    const { sessionId, code, device_id } = req.body;
    if (!sessionId || !code || !device_id) return res.status(400).json({ error: 'Missing exchange markers' });

    await client.query('BEGIN');

    // 1. [VALIDATE FIRST] SELECT FOR UPDATE: Lock the session row to prevent micro-races
    const sessionRes = await client.query(
      `SELECT wallet_address, code_consumed, code_expires_at 
       FROM remote_auth_sessions 
       WHERE id::text = $1 AND one_time_code = $2 AND device_id = $3
       FOR UPDATE`,
      [sessionId, code, device_id]
    );

    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      console.warn(`[SECURITY] Exchange attempt REJECTED: Invalid markers or Device Mismatch.`);
      return res.status(403).json({ error: 'Invalid exchange code' });
    }

    const { wallet_address, code_consumed, code_expires_at } = sessionRes.rows[0];

    // 2. Validate session state
    if (code_consumed) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Code already consumed' });
    }
    if (new Date(code_expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Code expired' });
    }

    const normalizedWalletAddress = wallet_address.toLowerCase();
    let user = (await client.query('SELECT id, wallet_address, role FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress])).rows[0];
    
    let roleData = null;
    let isBanned = false;
    let zeroTrustStatus = 'VERIFIED';

    try {
      const config = await ConfigService.getConfig();
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
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
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Banned' });
      }
    } catch (chainErr) {
      console.warn(`[AUTH_WARN] RPC Unreachable during exchange. Falling back to DB authority for ${normalizedWalletAddress}. Detail: ${chainErr.message}`);
      zeroTrustStatus = 'DEGRADED';
      
      // If we don't have a DB user and chain is down, we have to block as we can't even provision an admin
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(503).json({ error: 'Service Unavailable: Local identity missing and blockchain unreachable.' });
      }
      
      // Use DB role as fallback
      const ROLE_MAP = { 'none': 0, 'user': 1, 'notary': 2, 'admin': 3 };
      roleData = ROLE_MAP[user.role] || (isNaN(Number(user.role)) ? 1 : Number(user.role));
    }

    // Auto-Sync Admin Profile if missing (Only if VERIFIED or if we already have the user)
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
      });
    }

    if (!user) {
      await client.query('ROLLBACK');
      console.warn(`[EXCHANGE_FAIL] Account not found for ${normalizedWalletAddress}. Rolling back.`);
      return res.status(404).json({ error: 'Account not found' });
    }

    // 4. [MUTATE SECOND] Consume code now that ALL validations passed
    await client.query('UPDATE remote_auth_sessions SET code_consumed = TRUE WHERE id::text = $1', [sessionId]);

    const token = await signZeroTrustToken(user, normalizedWalletAddress, zeroTrustStatus);

    // 5. Persist token and COMMIT
    await client.query("UPDATE remote_auth_sessions SET token = $1 WHERE id::text = $2", [token, sessionId]);
    await client.query('COMMIT');

    res.json({ 
      token, 
      user: { id: user.id, walletAddress: normalizedWalletAddress, role: Number(roleData) },
      zeroTrustStatus,
      walletVerificationPending: zeroTrustStatus === 'DEGRADED'
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('[REMOTE_EXCHANGE_FATAL]', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

/**
 * 🛡️ [SELF-HEALING] POST /auth/remote/refresh-zero-trust
 * Responsibility: Upgrade a DEGRADED session to VERIFIED if RPC connectivity returns.
 * Rule: Server is the SOLE authority for upgrades.
 */
router.post('/remote/refresh-zero-trust', allowPublic, async (req, res) => {
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

    // 1. Idempotency: If already verified, no need to upgrade
    if (decoded.zeroTrustStatus === 'VERIFIED') {
      return res.json({ status: 'VERIFIED', message: 'Session already verified' });
    }

    const { address, id } = decoded;
    const normalizedAddress = address.toLowerCase();

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

      console.log(`[AUTH_UPGRADE] Session upgraded to VERIFIED for ${normalizedAddress}`);
      return res.json({ 
        status: 'VERIFIED', 
        token: newToken,
        user: { id, walletAddress: normalizedAddress, role: chainData.role } 
      });

    } catch (rpcErr) {
      // 🛡️ Fail-Safe: RPC still down? Stay DEGRADED.
      console.warn(`[AUTH_REFRESH_RETRY] Blockchain still unreachable for ${normalizedAddress}: ${rpcErr.message}`);
      return res.json({ status: 'DEGRADED', message: 'Blockchain still unreachable' });
    }
  } catch (err) {
    console.error('[AUTH_REFRESH_FATAL]', err);
    res.status(500).json({ status: 'ERROR', error: 'Internal server error' });
  }
});

module.exports = router;
