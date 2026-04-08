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

// Zero-Trust JWT Helper
async function signZeroTrustToken(user, walletAddress) {
  if (!user || !walletAddress) throw new Error("Missing user data for token signing");
  
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545");
    const network = await provider.getNetwork();
    const snapshotChainId = Number(network.chainId);
    const snapshotBlock = await provider.getBlockNumber();

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
    
    const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function adminCount() view returns (uint256)"], provider);
    const genesisContract = new ethers.Contract(config.contracts.genesisActivation, ["function activated() view returns (bool)"], provider);

    const [adminCount, activated, dbUserResult] = await Promise.all([
      registry.adminCount(),
      genesisContract.activated(),
      pool.query('SELECT COUNT(*) FROM users')
    ]);

    res.json({ 
      activated: !!activated, 
      adminCount: Number(adminCount),
      dbUserCount: parseInt(dbUserResult.rows[0].count)
    });
  } catch (error) {
    console.error('Status fetch error:', error);
    res.status(503).json({ error: 'Chain connectivity issue' });
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

    // 3. On-Chain Authority
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

      let user = result.rows.length > 0 ? userResult.rows[0] : null;

      if (!user && decoded.role === 3) {
        const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
        user = await UserService.createUser({
          name: 'Genesis Admin',
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
      res.json({ user });
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

    // 3. User Presence & On-Chain Authority Check
    const userRes = await client.query('SELECT id, wallet_address, role FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    let user = userRes.rows.length > 0 ? userRes.rows[0] : null;

    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)", "function isBanned(address) view returns (bool)"], provider);
    
    const [roleData, isBanned] = await Promise.all([
      registry.getUserRole(normalizedWalletAddress), 
      registry.isBanned(normalizedWalletAddress)
    ]);

    if (isBanned) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Banned' });
    }

    // Auto-Sync Admin Profile if missing
    if (!user && Number(roleData) === 3) {
      const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
      user = await UserService.createUser({
        name: 'Genesis Admin',
        wallet_address: normalizedWalletAddress,
        role: 'admin',
        is_human_verified: true,
        national_id_hash: nationalIdHash,
        password_hash: 'ADMIN_WEB3_ONLY',
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

    const token = await signZeroTrustToken(user, normalizedWalletAddress);

    // 5. Persist token and COMMIT
    await client.query("UPDATE remote_auth_sessions SET token = $1 WHERE id::text = $2", [token, sessionId]);
    await client.query('COMMIT');

    res.json({ token, user: { id: user.id, walletAddress: normalizedWalletAddress, role: Number(roleData) } });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('[REMOTE_EXCHANGE_FATAL]', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
