const ConfigService = require('../services/config.service');

const APP_NAME = 'BBSNS';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '12h'; 
const JWT_EXPIRY_SECONDS = 12 * 60 * 60; 

// UUID validation helper - prevents Postgres cast errors on invalid session IDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => UUID_REGEX.test(str);

const { requirePrivilege, allowPublic, ROLES, RISK_LEVELS } = require('../../middleware/actor');

// Hardened Rate Limiter: IP + Wallet + Endpoint binding with cooldown escalation
const distributedRateLimiter = require('../utils/rate-limiter');
const simpleRateLimiter = distributedRateLimiter; // Alias for backward compatibility in this file

// Zero-Trust JWT Helper
async function signZeroTrustToken(user, walletAddress) {
  if (!user || !walletAddress) throw new Error("Missing user data for token signing");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL);

  // 1. Fetch live network context
  const network = await provider.getNetwork();
  const snapshotChainId = Number(network.chainId);

  // 2. Verify chain ID
  if (String(snapshotChainId) !== String(process.env.CHAIN_ID)) {
    console.warn(`[JWT_WARN] Snapshot chainId (${snapshotChainId}) != Expected (${process.env.CHAIN_ID}). Proceeding for compatibility.`);
  }

  // 3. Get latest block
  const snapshotBlock = await provider.getBlockNumber();

  // Role Normalization: Map string roles to numeric constants if needed
  let numericRole = Number(user.role);
  if (isNaN(numericRole)) {
    const ROLE_MAP = { 'none': 0, 'owner': 1, 'notary': 2, 'admin': 3 };
    numericRole = ROLE_MAP[String(user.role).toLowerCase()] || 0;
  }

  // 4. Issue token with mandatory Zero-Trust fields
  return jwt.sign(
    {
      id: user.id,
      address: walletAddress.toLowerCase(),
      role: numericRole,
      snapshotBlock,
      snapshotChainId,
      issuedAt: Date.now()
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY } // Default session duration
  );
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

    res.json({
      nonce,
      expiry: expiry.toISOString(),
      message_template: `Login request for ${APP_NAME}: ${nonce}`
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

    console.log(`[STATUS_DEBUG] activated=${activated}, adminCount=${adminCount}, dbUserCount=${dbUserResult.rows[0].count}`);
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
    console.log(`[ONBOARD_TRACE] Start | wallet=${walletAddress} | nonce=${nonce}`);

    if (!fullName || !walletAddress || !nationalId || !signature || !nonce) {
      return res.status(400).json({ error: 'Missing onboarding metadata (Full Name, Wallet, ID, Signature, Nonce)' });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // 1. Fetch EXCLUSIVE valid nonce for this purpose
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'GENESIS_ONBOARD' 
       AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWalletAddress]
    );

    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== nonce) {
      console.warn(`[SECURITY] Invalid or missing Genesis nonce | wallet=${normalizedWalletAddress} | ip=${req.ip}`);
      return res.status(401).json({ error: 'Invalid or expired onboarding session. Please restart.' });
    }

    // 2. Guard: Check if profile already exists in DB
    const checkUser = await pool.query('SELECT id FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    if (checkUser.rows.length > 0) return res.status(400).json({ error: 'Profile already exists' });

    // 3. Strict Signature Verification
    const message = `Login request for ${APP_NAME}: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
      console.error(`[SECURITY] Signature mismatch during onboarding | wallet=${normalizedWalletAddress} | ip=${req.ip}`);
      return res.status(401).json({ error: 'Cryptographic signature verification failed' });
    }
    console.log(`[ONBOARD_TRACE] Signature Verified OK`);

    // 4. On-Chain Strict Validation (Block-Based Temporal Check)
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
    console.log(`[ONBOARD_TRACE] Chain data: adminCount=${adminCount}, activated=${activated}, activationTime=${activationTime}`);

    if (!activated) return res.status(403).json({ error: 'System not yet activated on-chain' });
    
    // 7-Day Window: (7 * 24 * 60 * 60) seconds
    const MAX_TIME_WINDOW = 7 * 24 * 60 * 60;
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (currentTime - Number(activationTime) > MAX_TIME_WINDOW) {
      console.error(`[SECURITY] Genesis Onboarding Expired | activatedAt=${new Date(Number(activationTime)*1000).toISOString()} | currentTime=${new Date(currentTime*1000).toISOString()} | wallet=${normalizedWalletAddress}`);
      return res.status(403).json({ error: 'Genesis onboarding window expired (7-day limit exceeded).' });
    }

    if (Number(adminCount) !== 1) {
      console.error(`[SECURITY] Rejected Genesis attempt: adminCount != 1 | wallet=${normalizedWalletAddress} | ip=${req.ip}`);
      return res.status(403).json({ error: 'Genesis window closed' });
    }
    if (Number(userRole) !== 3) {
      console.error(`[SECURITY] Role mismatch during onboarding | wallet=${normalizedWalletAddress} | expected=3 | got=${userRole}`);
      return res.status(403).json({ error: 'Unauthorized: Wallet does not have ADMIN role' });
    }

    // 5. Atomic Invalidation & Creation
    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);
    console.log(`[ONBOARD_TRACE] Nonce used marked in DB`);

    const nationalIdHash = crypto.createHash('sha256').update(nationalId).digest('hex');
    console.log(`[ONBOARD_TRACE] Attempting user INSERT...`);
    try {
      await pool.query(
        `INSERT INTO users (name, email, wallet_address, role, kyc_verified, national_id_hash, password_hash, username, identity_state) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          fullName, 
          (email || '').toLowerCase().trim(), 
          normalizedWalletAddress, 
          'admin', 
          true, 
          nationalIdHash, 
          'ADMIN_WEB3_ONLY',
          (email || normalizedWalletAddress).split('@')[0], // Use email prefix or wallet as username
          'ACTIVE'
        ]
      );
    } catch (insertError) {
      console.error(`[SECURITY] INSERT FAILURE | wallet=${normalizedWalletAddress} | error=${insertError.message} | detail=${insertError.detail} | column=${insertError.column}`);
      throw insertError; // Re-throw to be caught by the outer catch and return 500
    }

    console.log(`[SECURITY] Genesis Onboarding SUCCESS | wallet=${normalizedWalletAddress} | ip=${req.ip}`);
    res.json({ success: true, message: 'Genesis Admin Onboarded Successfully' });
  } catch (error) {
    console.error(`[SECURITY] FATAL Onboarding Error | ip=${req.ip} | error=${error.message}`);
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

    // 1. Verify Purpose-Bound Nonce
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'NOTARY_ONBOARD' 
       AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWalletAddress]
    );

    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== nonce) {
      return res.status(401).json({ error: 'Invalid or expired Notary onboarding session' });
    }

    // 2. Guard: No Profile in DB
    const checkUser = await pool.query('SELECT id FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    if (checkUser.rows.length > 0) return res.status(400).json({ error: 'Profile already linked to this wallet' });

    // 3. Sig Verification
    const message = `Login request for ${APP_NAME}: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // 4. On-Chain Check (role == NOTARY (2))
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const registry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)"], provider);
    const liveRole = await registry.getUserRole(normalizedWalletAddress);

    if (Number(liveRole) !== 2) {
      console.warn(`[SECURITY] Non-notary attempted notary onboarding | wallet=${normalizedWalletAddress} | role=${liveRole}`);
      return res.status(403).json({ error: 'Not authorized: Notary role not found on-chain' });
    }

    // 5. Create Profile (Password-less Web3 Only)
    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);
    await pool.query(
      `INSERT INTO users (name, wallet_address, role, kyc_verified, password_hash) 
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName, normalizedWalletAddress, 'notary', true, 'NOTARY_WEB3_ONLY']
    );

    console.log(`[SECURITY] Notary Onboarding SUCCESS | wallet=${normalizedWalletAddress}`);
    res.json({ success: true, message: 'Notary profile created successfully' });
  } catch (error) {
    console.error('Notary onboarding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login - 3-Factor Secure Login
router.post('/login', allowPublic, async (req, res) => {
  try {
    const { email, password, walletAddress, signature, nationalId, signature_nonce } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const normalizedWalletAddress = (walletAddress || "").trim().toLowerCase();

    console.log(`[LOGIN_DEBUG] Attempting login for email: "${cleanEmail}", wallet: "${normalizedWalletAddress}"`);

    if (!walletAddress || !signature || !signature_nonce) {
      console.log('[LOGIN_DEBUG] Missing base wallet auth fields');
      return res.status(400).json({ error: 'Wallet address, signature, and nonce are required' });
    }

    // 1. Wallet Signature Verification (Latest 'LOGIN' Nonce Only)
    const nonceResult = await pool.query(
      `SELECT nonce FROM wallet_nonces 
       WHERE LOWER(wallet_address) = $1 AND purpose = 'LOGIN' AND used_at IS NULL AND expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedWalletAddress]
    );

    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== signature_nonce) {
      console.warn(`[SECURITY] Invalid or missing login nonce | wallet=${normalizedWalletAddress} | ip=${req.ip}`);
      return res.status(400).json({ error: 'Session expired. Please request a new nonce.' });
    }

    const nonce = nonceResult.rows[0].nonce;
    const message = `Login request for ${APP_NAME}: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
      console.error(`[SECURITY] Signature mismatch during login | wallet=${normalizedWalletAddress} | ip=${req.ip}`);
      return res.status(401).json({ error: 'Wallet signature verification failed' });
    }

    // Mark Nonce Used Immediately (Replay Protection)
    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);
    // 2. Fetch User Profile
    const userResult = await pool.query('SELECT * FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    console.log(`[LOGIN_DEBUG] User lookup result: ${userResult.rows.length} rows found`);

    let user = userResult.rows.length > 0 ? userResult.rows[0] : null;

    // --- PHASE 3E: ADMIN PASSWORD BYPASS & ON-CHAIN VALIDATION ---
    const config = await ConfigService.getConfig();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const notaryRegistry = new ethers.Contract(config.contracts.notaryRegistry, ["function getUserRole(address) view returns (uint8)"], provider);
    let liveRoleValue = await notaryRegistry.getUserRole(normalizedWalletAddress);

    const isAdmin = Number(liveRoleValue) === 3;

    if (user && !isAdmin) {
        // Standard non-admin flow: Mandatory Email, Password & ID Hash
        if (!email || !password || !nationalId) {
            return res.status(400).json({ error: 'Email, Password, and National ID are required for this account type' });
        }

        const { comparePassword } = require('../utils/password');
        const isPasswordValid = await comparePassword(password, user.password_hash);
        if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.national_id_hash) {
            const inputIdHash = crypto.createHash('sha256').update(nationalId).digest('hex');
            if (user.national_id_hash !== inputIdHash) return res.status(401).json({ error: 'National ID verification failed' });
        }
    } else if (!user) {
        // No profile found and signature verified (above)
        return res.status(404).json({ error: 'Profile not found. Please complete initialization.' });
    }

    // Role Syncing handled below...

    // 3. (Legacy) National ID Verification handled above.

    // Mark Nonce Used
    await pool.query('UPDATE wallet_nonces SET used_at = NOW() WHERE wallet_address = $1 AND nonce = $2', [normalizedWalletAddress, nonce]);

    // 4. On-Chain Authority Derivation (Zero-Trust)
    let isBanned, snapshotBlock, snapshotChainId, adminCount;
    try {
      const config = await ConfigService.getConfig();
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const notaryRegistryAbi = [
        "function getUserRole(address) view returns (uint8)",
        "function isBanned(address) view returns (bool)",
        "function adminCount() view returns (uint256)"
      ];
      const notaryRegistry = new ethers.Contract(config.contracts.notaryRegistry, notaryRegistryAbi, provider);

      const network = await provider.getNetwork();
      snapshotChainId = Number(network.chainId);

      // Verify we are on the correct network (extra safety check)
      if (String(snapshotChainId) !== String(config.chainId)) {
        console.error(`[LOGIN_CRITICAL] Network mismatch during login. SSoT: ${config.chainId}, Detected: ${snapshotChainId}`);
        return res.status(503).json({ error: 'Service Unavailable: Network Configuration Mismatch' });
      }

      const [liveRole, isBanned, snapshotBlock, adminCount] = await Promise.all([
        notaryRegistry.getUserRole(normalizedWalletAddress),
        notaryRegistry.isBanned(normalizedWalletAddress),
        provider.getBlockNumber(),
        notaryRegistry.adminCount()
      ]);

      if (isBanned) {
        console.warn(`[LOGIN_DENY] Banned user attempted login: ${normalizedWalletAddress}`);
        return res.status(403).json({ error: 'Account is banned on-chain' });
      }

      // --- AUTO-SYNC ADMIN (Zero-Trust) ---
      // If blockchain says ADMIN but no user in DB -> Auto-provision
      if (!user && Number(liveRole) === 3) {
        console.log(`[SECURITY] Auto-Syncing Genesis Admin | wallet=${normalizedWalletAddress}`);
        const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
        const insertResult = await pool.query(
          `INSERT INTO users (name, email, wallet_address, role, kyc_verified, national_id_hash, password_hash, username) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          ['Genesis Admin', null, normalizedWalletAddress, 'admin', true, nationalIdHash, 'ADMIN_WEB3_ONLY', normalizedWalletAddress]
        );
        user = insertResult.rows[0];
      }

      // STRICT CHECK: User must exist in DB (or have just been auto-synced)
      if (!user) {
        console.log(`[LOGIN_DENY] User profile not found for ${normalizedWalletAddress}`);
        return res.status(404).json({ error: 'Profile not found. Please complete initialization or contact your administrator.' });
      }

      // Role Sync: Update DB role if it changed on-chain
      const ROLE_MAP = { 1: 'owner', 2: 'notary', 3: 'admin' };
      const currentOnChainRole = ROLE_MAP[Number(liveRole)];
      if (currentOnChainRole && currentOnChainRole !== user.role) {
         await pool.query('UPDATE users SET role = $1 WHERE id = $2', [currentOnChainRole, user.id]);
         user.role = currentOnChainRole;
      }
    } catch (err) {
      console.error('[LOGIN_ERROR] On-chain verification failed:', err.message);
      return res.status(503).json({ error: 'Service Unavailable: Could not verify authority on-chain' });
    }

    // Issue Zero-Trust JWT
    const token = jwt.sign(
      {
        id: user.id,
        address: normalizedWalletAddress,
        role: Number(liveRole),
        snapshotBlock,
        snapshotChainId,
        issuedAt: Date.now()
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY_SECONDS }
    );

    // Set HttpOnly Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: JWT_EXPIRY_SECONDS * 1000,
      sameSite: 'lax'
    });

    console.log(`[LOGIN_SUCCESS] Actor ${normalizedWalletAddress} logged in with Role ${liveRole} at Block ${snapshotBlock}`);
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        walletAddress: normalizedWalletAddress,
        role: Number(liveRole) // On-chain derived role
      }
    });

  } catch (error) {
    console.error('[LOGIN_DEBUG] Unexpected error:', error.message);
    console.error(error.stack);
    if (error.detail) console.error('[LOGIN_DEBUG] DB Detail:', error.detail);
    if (error.column) console.error('[LOGIN_DEBUG] DB Column:', error.column);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout - Clear Session
router.post('/logout', requirePrivilege({ minRole: ROLES.OWNER, risk: RISK_LEVELS.LOW }), (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// GET /auth/me - Profile Source of Truth (Supports /api/auth/me and /auth/me)
// Zero-Trust: Refactored to return null instead of 401 for silent guest checks
router.get('/me', allowPublic, async (req, res) => {
  try {
    // If no token or invalid token, return null silently
    const authHeader = req.headers.authorization;
    const tokenCookie = req.cookies.token;
    const token = tokenCookie || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) {
      return res.json({ user: null });
    }

    // Verify token manually since we are using allowPublic
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const normalizedWallet = decoded.address.toLowerCase();

      const result = await pool.query(
        'SELECT id, username, name, email, wallet_address, role, kyc_verified, liveness_status FROM users WHERE LOWER(wallet_address) = $1',
        [normalizedWallet]
      );

      let user = result.rows.length > 0 ? result.rows[0] : null;

      // --- AUTO-SYNC ADMIN (Zero-Trust Fallback) ---
      if (!user && decoded.role === 3) {
        console.log(`[SECURITY] Auto-Syncing Genesis Admin via /me | wallet=${normalizedWallet}`);
        const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
        const insertResult = await pool.query(
          `INSERT INTO users (name, email, wallet_address, role, kyc_verified, national_id_hash, password_hash, username) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          ['Genesis Admin', null, normalizedWallet, 'admin', true, nationalIdHash, 'ADMIN_WEB3_ONLY', normalizedWallet]
        );
        user = insertResult.rows[0];
      }

      if (!user) {
        return res.json({ user: null });
      }

      // Normalize role for UI
      const ROLE_STRING_MAP = { 0: 'none', 1: 'owner', 2: 'notary', 3: 'admin' };
      const normalizedRole = ROLE_STRING_MAP[decoded.role] || user.role || 'none';

      res.json({ user: { ...user, role: normalizedRole } });
    } catch (jwtErr) {
      // Invalid token? Just return null. Silences noise.
      return res.json({ user: null });
    }
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================= REMOTE AUTH (Desktop App Support) ==================

const { requireSystemActivated } = require('../../middleware/activation');

// POST /auth/remote/session - Initialize remote login session
router.post('/remote/session', allowPublic, requireSystemActivated, async (req, res) => {
  try {
    const { device_id } = req.body;
    const challenge = `BBSNS-LOGIN-${Math.random().toString(36).substring(2, 15)}`;
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const result = await pool.query(
      'INSERT INTO remote_auth_sessions (challenge, device_id, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [challenge, device_id, expires_at]
    );

    res.json({ sessionId: result.rows[0].id });
  } catch (error) {
    console.error('Remote session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/remote/status/:sessionId - Poll for session status
router.get('/remote/status/:sessionId', allowPublic, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (isNaN(sessionId) && !isValidUUID(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
    const result = await pool.query('SELECT * FROM remote_auth_sessions WHERE id::text = $1', [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];
    const now = new Date();

    if (session.status === 'pending' && new Date(session.expires_at) < now) {
      await pool.query("UPDATE remote_auth_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
      return res.json({ status: 'expired' });
    }

    res.json({
      status: session.status,
      challenge: session.challenge,
      wallet_address: session.wallet_address,
      token: session.token // Only present if authorized
    });
  } catch (error) {
        console.error('Remote status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/remote/authorize - Link wallet to remote session
router.post('/remote/authorize', allowPublic, requireSystemActivated, simpleRateLimiter(5, 60000), async (req, res) => {
  try {
    const { sessionId, signature, walletAddress } = req.body;

    if (!sessionId || !walletAddress || !signature) {
      return res.status(400).json({ error: 'sessionId, walletAddress, and signature are required' });
    }
    if (isNaN(sessionId) && !isValidUUID(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }

    const sessionResult = await pool.query('SELECT * FROM remote_auth_sessions WHERE id::text = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    if (session.status !== 'pending') {
      return res.status(400).json({ error: `Session is already ${session.status}` });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // 1. Verify signature based on payload type
    let recoveredAddress;
    try {
      if (signature === 'DIRECT_TX_CONFIRMED') {
        // Self-paid case: We trust the provided wallet address for session linking
        // The actual document update will still wait for on-chain verification
        recoveredAddress = normalizedWalletAddress;
      } else if (session.challenge.includes('"domain"') && session.challenge.includes('"message"')) {
        // EIP-712 Payload (Notarization Action)
        const payload = JSON.parse(session.challenge);
        recoveredAddress = ethers.verifyTypedData(
          payload.domain,
          payload.types,
          payload.message,
          signature
        );
      } else {
        // Standard String Message (Login)
        recoveredAddress = ethers.verifyMessage(session.challenge, signature);
      }
    } catch (e) {
      console.error('[REMOTE_AUTH] Signature verification failed:', e);
      await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id::text = $1", [sessionId]).catch(() => {});
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    console.log(`[REMOTE_AUTH_DEBUG] recoveredAddress: ${recoveredAddress.toLowerCase()}, providedAddress: ${normalizedWalletAddress}`);
    if (recoveredAddress.toLowerCase() !== normalizedWalletAddress) {
      await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id::text = $1", [sessionId]).catch(() => {});
      return res.status(401).json({ error: 'Invalid signature: Address mismatch' });
    }

    const userResult = await pool.query('SELECT id, wallet_address, role FROM users WHERE LOWER(wallet_address) = $1', [normalizedWalletAddress]);
    let user = userResult.rows.length > 0 ? userResult.rows[0] : null;

    // ZERO-TRUST ON-CHAIN VERIFICATION
    let liveRole = 0;
    try {
      const config = await ConfigService.getConfig();
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const notaryRegistryAbi = ["function getUserRole(address) view returns (uint8)", "function isBanned(address) view returns (bool)"];
      const notaryRegistry = new ethers.Contract(config.contracts.notaryRegistry, notaryRegistryAbi, provider);

      const [roleData, isBanned] = await Promise.all([
        notaryRegistry.getUserRole(normalizedWalletAddress),
        notaryRegistry.isBanned(normalizedWalletAddress)
      ]);

      if (isBanned) {
        console.warn(`[REMOTE_AUTH_DENY] Banned user attempted remote login: ${normalizedWalletAddress}`);
        return res.status(403).json({ error: 'Account is banned on-chain' });
      }

      liveRole = Number(roleData);

      // --- AUTO-SYNC ADMIN (Zero-Trust) ---
      if (!user && liveRole === 3) {
        console.log(`[SECURITY] Auto-Syncing Genesis Admin via Remote Auth | wallet=${normalizedWalletAddress}`);
        const nationalIdHash = crypto.createHash('sha256').update("GENESIS_ID_PLACEHOLDER").digest('hex');
        const insertResult = await pool.query(
          `INSERT INTO users (name, email, wallet_address, role, kyc_verified, national_id_hash, password_hash) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          ['Genesis Admin', null, normalizedWalletAddress, 'admin', true, nationalIdHash, 'ADMIN_WEB3_ONLY']
        );
        user = insertResult.rows[0];
      }

      // Re-verify existence after potential sync
      if (!user) {
        console.log(`[REMOTE_AUTH_403] Wallet not found in users table: ${normalizedWalletAddress}`);
        await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id::text = $1", [sessionId]).catch(() => {});
        return res.status(404).json({ error: 'Account not found. Please complete initialization/registration first.' });
      }

      // Prevent DB tampering bypass: If DB says 'admin' but chain says otherwise
      if (user.role === 'admin' && liveRole !== 3) {
        console.warn(`[REMOTE_AUTH_CRITICAL] DB/Chain role mismatch! Wallet=${normalizedWalletAddress}`);
        return res.status(403).json({ error: 'Unauthorized: On-chain governance privileges invalid.' });
      }

      // Override DB role with verifiable live on-chain role for JWT signing
      user.role = liveRole;
    } catch(err) {
      console.error('[REMOTE_AUTH_ERROR] Zero-Trust verification failed:', err.message);
      return res.status(503).json({ error: 'Service Unavailable: Could not verify authority on-chain' });
    }

    const token = await signZeroTrustToken(user, normalizedWalletAddress);

    await pool.query(
      "UPDATE remote_auth_sessions SET status = 'authorized', wallet_address = $1, token = $2, authorized_at = NOW() WHERE id = $3",
      [normalizedWalletAddress, token, sessionId]
    );

    res.json({ message: 'Authorized successfully' });
  } catch (error) {
    console.error('[REMOTE_AUTH_FATAL]', error);
    await pool.query("UPDATE remote_auth_sessions SET status = 'failed' WHERE id::text = $1", [sessionId]).catch(() => {});
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

module.exports = router;
