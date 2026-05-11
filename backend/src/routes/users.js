const express = require("express");
const router = express.Router();
const pool = require("../db/index.js");
const { hashPassword } = require("../utils/password.js");
const { requirePrivilege, ROLES, RISK_LEVELS, allowPublic, withGuestContext } = require("../middleware/actor.js");
// activation.js defunct
const UserService = require("../services/UserService");
const { ACTOR_IDS } = require('../constants/protocol'); // 🛡️ [Fix] Canonical source

const multer = require("multer");
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit (KYC Hardening)
});


const { userSchema, validateBody } = require("../utils/validation.js");
const { withDomain, withAction, withMutation } = require("../middleware/policy.js");
const { withRestoredContext } = require('../middleware/context-rebinder');
const dbContext = require('../db/context');
const { 
    verifyProtocolSignature 
} = require("../utils/identity-crypto");

// REGISTER User (public)
router.post("/register", withDomain('USERS'), allowPublic, requirePrivilege({ capability: 'USERS_REGISTER', allowPublic: true }), withGuestContext, withRestoredContext(upload.single('nationalIdFile')), validateBody(userSchema), withAction('USERS_REGISTER'), withMutation(), async (req, res) => {
  // 🛡️ [Hardening] Backend is the final authority for input normalization
  const body = req.body || {};
  
  const name = body.fullName;
  const email = body.email;
  const password = body.password;
  const nationalId = body.nationalId || body.nationalIdText;
  const faceDescriptor = body.faceDescriptor; // 🛡️ [Fix] Extract from req.body (not undefined var)
  const signature = body.signature;
  const clientNonce = body.nonce;
  const clientVersion = body.version || 'v1'; // 🛡️ [SENTINEL_3.1] Explicit protocol routing
  
  if (!signature) {
    return res.status(400).json({ status: 'error', error: 'Cryptographic signature is required' });
  }

  if (!clientNonce) {
    return res.status(400).json({ status: 'error', error: 'Authentication nonce is required for deterministic verification' });
  }

  console.log("[REGISTER_DEBUG] Standardized input received. Initiating Deterministic Signature Recovery...");

  const normalizedWalletAddress = (body.walletAddress || '').toLowerCase();

  if (!normalizedWalletAddress || !/^0x[a-fA-F0-9]{40}$/.test(normalizedWalletAddress)) {
    return res.status(400).json({ status: 'error', error: 'A valid Ethereum wallet address is required for registration.' });
  }

  console.log("[REGISTER_DEBUG] Inputs validated. Hashing sensitive data...");
  const password_hash = await hashPassword(password);

  const crypto = require('crypto');
  // 🛡️ [SIGNUP_CONTRACT] National ID Normalization: TRIM -> REMOVE ALL SPACES -> UPPERCASE
  const normalizedNationalId = (nationalId || "").toString().replace(/\s+/g, '').toUpperCase();
  const national_id_hash = normalizedNationalId ? crypto.createHash('sha256').update(normalizedNationalId).digest('hex') : null;

  console.log("[REGISTER_DEBUG] Data hashed. Starting unified registration transaction...");

  // 🛡️ [SENTINEL_3.1] Unified Transaction: Signature Verification + User Creation
  // Both AUTH_NONCES UPDATE and USERS INSERT run in one audit context with USERS_REGISTER action.
  // This resolves SYSTEM_BOOTSTRAP action inheritance by correctly using the middleware-set action.
  try {
    const user = await pool.runWithContext({
      userId: ACTOR_IDS.GUEST,
      reason: 'USER_SIGNUP_WITH_SIG_VERIFY',
      route: req.originalUrl,
      requestId: req.requestId || 'UNKNOWN',
      service: 'AUTH_SERVICE'
    }, async (auditClient) => {

      // 🛡️ [Hardening] Dual-Path Branching for Backend Challenge Parity
      // Multi-type check: Multer (FormData) sends strings, JSON sends booleans.
      const isBackendChallenge = body.backendChallenge === true || body.backendChallenge === 'true';
      let verificationPayload = body;
      
      if (!isBackendChallenge) {
         // Legacy map: Map 'nationalIdText' back to 'nationalId' strictly for hashing
         verificationPayload = {
            ...body,
            nationalId: body.nationalIdText || body.nationalId
         };
      }

      // Step 1: Verify signature & atomically consume nonce (AUTH_NONCES UPDATE)
      console.log(`[REGISTER_DEBUG] Attempting signature verification for wallet: ${body.walletAddress} with nonce: ${clientNonce}`);
      
      try {
        await verifyProtocolSignature({
          purpose: 'REGISTER',
          nonce: clientNonce,
          wallet: body.walletAddress,
          signature,
          rawPayload: verificationPayload,
          version: clientVersion,
          client: auditClient,  // ✅ Same auditClient = sentinel sees USERS_REGISTER action
          requestId: req.requestId || 'USER_REGISTRATION'
        });
        console.log("[REGISTER_DEBUG] Signature VALID. Proceeding to duplication check...");
      } catch (sigErr) {
        console.error("[REGISTER_DEBUG] Signature INVALID:", sigErr.message);
        throw sigErr;
      }

      // Step 2: Global Identity Check (Cross-table uniqueness)
      // 🛡️ [Hardening] This prevents users from registering with emails/wallets already used in 
      // pending notary applications, ensuring a clean identity map.
      await UserService.checkGlobalUniqueness({
        email,
        walletAddress: normalizedWalletAddress,
        nationalIdHash: national_id_hash,
        nationalIdNumber: normalizedNationalId
      }, auditClient);

      // Step 3: Create user (USERS INSERT)
      const newUser = await UserService.createUser({
        username: email.toLowerCase().trim(),
        name,
        email: email.toLowerCase().trim(),
        wallet_address: normalizedWalletAddress,
        password_hash,
        national_id_hash,
        face_descriptor: JSON.stringify(faceDescriptor),
        wallet_nonce: signature,
        role: 'user',
        is_human_verified: true,
        identity_state: 'ACTIVE'
      }, auditClient);

      return newUser;
    });

    console.log("[REGISTER_DEBUG] Registration successful for:", email);
    res.status(201).json(user);
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message && (err.message.includes('Authentication failed') || err.message.includes('Cryptographic'))) {
      return res.status(401).json({ status: 'error', error: err.message });
    }
    console.error("[REGISTER_DEBUG] FATAL REGISTRATION ERROR:", err);
    if (err.code === '23505') {
      const field = err.detail?.includes('email') ? 'Email' : err.detail?.includes('wallet') ? 'Wallet' : 'User';
      return res.status(409).json({ error: `${field} already registered` });
    }
    res.status(500).json({ error: err.message });
  }
});

// Apply actor loading middleware to all routes except register
// router.use(loadActor) deprecated for zero-trust compliance

// CREATE User (Admin only)
router.post("/", withDomain('USERS'), requirePrivilege({ capability: 'USERS_CREATE' }), withAction('USERS_CREATE'), withMutation(), validateBody(userSchema), async (req, res) => {
  const { username, fullName: name, email, password, walletAddress: wallet_address, role } = req.body;
  try {
    const normalizedWalletAddress = wallet_address.toLowerCase();
    // Check for duplicate email or wallet
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(wallet_address) = $2',
      [email, normalizedWalletAddress]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or wallet address already registered' });
    }
    const password_hash = await hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users (username, name, email, password_hash, wallet_address, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, email, wallet_address, role, created_at",
      [username || name, name, email, password_hash, normalizedWalletAddress, role || 'user']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// READ All Users
router.get("/", requirePrivilege({ capability: 'USERS_LIST' }), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ User by ID
router.get("/:id", requirePrivilege({ capability: 'USERS_READ' }), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE User
router.put("/:id", withDomain('USERS'), requirePrivilege({ capability: 'USERS_UPDATE' }), withAction('USERS_UPDATE'), withMutation(), async (req, res) => {
  const { username, email, password, wallet_address, role, kyc_status, liveness_status, national_id_hash } = req.body;

  // Prevent wallet_address update
  if (wallet_address !== undefined) {
    return res.status(400).json({ error: "Wallet address update is not allowed" });
  }

  // Role enforcement: only admin can change role
  if (role !== undefined && Number(req.actor.role) < ROLES.ADMIN) {
    return res.status(403).json({ error: 'Insufficient role' });
  }

  try {
    // Check for duplicate email
    if (email !== undefined) {
      const emailCheck = await pool.query("SELECT id FROM users WHERE email=$1 AND id <> $2", [email, req.params.id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    // Build update query dynamically
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (password !== undefined) {
      const password_hash = await hashPassword(password);
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(password_hash);
    }
    if (role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    // Handle liveness_status (prefer explicit field, fallback to legacy kyc_status)
    const newStatus = liveness_status !== undefined ? liveness_status : kyc_status;
    if (newStatus !== undefined) {
      fields.push(`liveness_status = $${paramIndex++}`);
      values.push(newStatus);
    }
    if (national_id_hash !== undefined) {
      fields.push(`national_id_hash = $${paramIndex++}`);
      values.push(national_id_hash);
    }
    // Allow updating face_descriptor (legacy 'descriptor' or 'faceDescriptor')
    const descriptor = req.body.faceDescriptor || req.body.descriptor;
    if (descriptor !== undefined) {
      fields.push(`face_descriptor = $${paramIndex++}`);
      // Ensure it's stored as JSON
      values.push(typeof descriptor === 'string' ? descriptor : JSON.stringify(descriptor));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const query = `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;
    values.push(req.params.id);

    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SOFT DELETE User (Admin only)
router.delete("/:id", withDomain('USERS'), requirePrivilege({ capability: 'USERS_DEACTIVATE' }), withAction('USERS_DEACTIVATE'), withMutation(), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET is_deactivated = true, deactivated_at = NOW() WHERE id = $1 RETURNING id, is_deactivated",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
